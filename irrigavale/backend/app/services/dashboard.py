from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, Farm, Irrigation, IrrigationStatus, User, Zone
from app.schemas import DashboardOut
from app.services.irrigation import OPEN_STATUSES
from app.services.mappers import irrigation_out, zone_out
from app.services.time_utils import day_bounds_utc, utcnow


async def build_dashboard(session: AsyncSession, user: User, farm: Farm) -> DashboardOut:
    now = utcnow()
    zones = (
        (
            await session.execute(
                select(Zone)
                .where(Zone.farm_id == farm.id, Zone.archived_at.is_(None))
                .order_by(Zone.name)
            )
        )
        .scalars()
        .all()
    )

    day_start, day_end = day_bounds_utc(farm.timezone, now)
    water_used = await session.scalar(
        select(func.coalesce(func.sum(Irrigation.volume_l_actual), 0))
        .select_from(Irrigation)
        .join(Zone, Zone.id == Irrigation.zone_id)
        .where(
            Zone.farm_id == farm.id,
            Irrigation.status == IrrigationStatus.done,
            Irrigation.finished_at >= day_start,
            Irrigation.finished_at < day_end,
        )
    )

    active_rows = (
        await session.execute(
            select(Irrigation, Zone.name)
            .join(Zone, Zone.id == Irrigation.zone_id)
            .where(Zone.farm_id == farm.id, Irrigation.status.in_(OPEN_STATUSES))
            .order_by(Irrigation.scheduled_at)
            .limit(20)
        )
    ).all()

    unread = await session.scalar(
        select(func.count(Alert.id)).where(
            Alert.farm_id == farm.id, Alert.read_at.is_(None), Alert.dismissed_at.is_(None)
        )
    )

    return DashboardOut(
        farm_name=farm.name,
        user_name=user.name,
        zones=[zone_out(z, now) for z in zones],
        water_used_today_l=int(water_used or 0),
        water_goal_l=farm.daily_water_goal_l,
        active_irrigations=[irrigation_out(i, name) for i, name in active_rows],
        unread_alerts=int(unread or 0),
    )
