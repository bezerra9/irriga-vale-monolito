"""Rotinas recorrentes: geram irrigações programadas no horário configurado."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Farm,
    Irrigation,
    IrrigationOrigin,
    IrrigationStatus,
    Reading,
    Routine,
    Zone,
    ZoneManagement,
)
from app.services.mappers import offline_window
from app.services.rules import estimate_volume_l
from app.services.time_utils import local_datetime_to_utc, local_now, utcnow

# Janela de tolerância: se o agendador atrasar, a rotina ainda é disparada nos próximos minutos.
CATCH_UP_MINUTES = 5


def weekday_list(mask: int) -> list[int]:
    return [d for d in range(7) if mask & (1 << d)]


async def run_due_routines(session: AsyncSession, now: datetime | None = None) -> int:
    now = now or utcnow()
    rows = (
        await session.execute(
            select(Routine, Zone, Farm)
            .join(Zone, Zone.id == Routine.zone_id)
            .join(Farm, Farm.id == Zone.farm_id)
            .where(Routine.active.is_(True), Zone.archived_at.is_(None))
        )
    ).all()

    created = 0
    for routine, zone, farm in rows:
        local = local_now(farm.timezone, now)
        if local.weekday() not in weekday_list(routine.weekdays):
            continue
        start_minutes = routine.start_time.hour * 60 + routine.start_time.minute
        elapsed = local.hour * 60 + local.minute - start_minutes
        if not 0 <= elapsed < CATCH_UP_MINUTES:
            continue

        slot = local_datetime_to_utc(farm.timezone, local.date(), routine.start_time)
        already = (
            await session.execute(
                select(Irrigation.id).where(
                    Irrigation.routine_id == routine.id, Irrigation.scheduled_at == slot
                )
            )
        ).first()
        if already is not None:
            continue

        status, reason = await _decide(session, routine, zone, now)
        session.add(
            Irrigation(
                zone_id=zone.id,
                routine_id=routine.id,
                origin=IrrigationOrigin.routine,
                status=status,
                scheduled_at=slot,
                duration_min=routine.duration_min,
                volume_l_estimated=estimate_volume_l(zone.area_ha, routine.duration_min),
                reason=reason,
            )
        )
        created += 1

    await session.commit()
    return created


async def _decide(
    session: AsyncSession, routine: Routine, zone: Zone, now: datetime
) -> tuple[IrrigationStatus, str]:
    if zone.management == ZoneManagement.planned_stress:
        return IrrigationStatus.skipped, "Zona em manejo de déficit controlado"

    if routine.respect_sensor:
        latest = (
            await session.execute(
                select(Reading.moisture_pct, Reading.recorded_at)
                .where(Reading.zone_id == zone.id)
                .order_by(Reading.recorded_at.desc())
                .limit(1)
            )
        ).first()
        if latest is not None:
            moisture, recorded_at = latest
            fresh = now - recorded_at <= offline_window()
            if fresh and moisture >= routine.moisture_limit:
                return (
                    IrrigationStatus.skipped,
                    f"Solo úmido ({moisture:.0f}%): rotina pulada pelo sensor",
                )

    return IrrigationStatus.approved, "Rotina programada"
