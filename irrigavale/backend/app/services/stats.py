"""Resumo de consumo e economia de água por período (hoje ou mês corrente)."""

from datetime import datetime, time, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Farm, Irrigation, IrrigationStatus, Zone
from app.schemas import SummaryOut
from app.services import rules
from app.services.time_utils import day_bounds_utc, local_datetime_to_utc, local_now, utcnow

Period = Literal["today", "month"]


def period_bounds(tz: str, period: Period, now: datetime) -> tuple[datetime, datetime]:
    if period == "today":
        return day_bounds_utc(tz, now)
    first = local_now(tz, now).date().replace(day=1)
    next_month = (first + timedelta(days=32)).replace(day=1)
    return local_datetime_to_utc(tz, first, time(0)), local_datetime_to_utc(tz, next_month, time(0))


async def build_summary(session: AsyncSession, farm: Farm, period: Period) -> SummaryOut:
    start, end = period_bounds(farm.timezone, period, utcnow())
    zone_ids = select(Zone.id).where(Zone.farm_id == farm.id)

    done = (
        await session.execute(
            select(Irrigation.volume_l_estimated, Irrigation.volume_l_actual).where(
                Irrigation.zone_id.in_(zone_ids),
                Irrigation.status == IrrigationStatus.done,
                Irrigation.finished_at >= start,
                Irrigation.finished_at < end,
            )
        )
    ).all()
    skipped = (
        await session.scalars(
            select(Irrigation.volume_l_estimated).where(
                Irrigation.zone_id.in_(zone_ids),
                Irrigation.status == IrrigationStatus.skipped,
                Irrigation.scheduled_at >= start,
                Irrigation.scheduled_at < end,
            )
        )
    ).all()

    saved_l, saved_brl = rules.water_savings(
        list(skipped), [(e, a) for e, a in done], farm.water_price_brl_per_m3
    )
    return SummaryOut(
        period=period,
        period_start=start,
        water_used_l=sum(a or 0 for _, a in done),
        irrigations_done=len(done),
        irrigations_skipped=len(skipped),
        water_saved_l=saved_l,
        savings_brl=saved_brl,
    )
