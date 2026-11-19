import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import select, update

from app.api.deps import CurrentFarm, DbSession
from app.core.errors import ValidationRuleError
from app.models import Device, Reading, Zone
from app.schemas import ReadingOut, ZoneIn, ZoneOut, ZoneUpdate
from app.services.access import get_farm_zone
from app.services.mappers import zone_out
from app.services.time_utils import utcnow

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("", response_model=list[ZoneOut])
async def list_zones(farm: CurrentFarm, session: DbSession) -> list[ZoneOut]:
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
    now = utcnow()
    return [zone_out(z, now) for z in zones]


@router.post("", status_code=201, response_model=ZoneOut)
async def create_zone(payload: ZoneIn, farm: CurrentFarm, session: DbSession) -> ZoneOut:
    zone = Zone(farm_id=farm.id, **payload.model_dump())
    session.add(zone)
    await session.commit()
    await session.refresh(zone)
    return zone_out(zone)


@router.get("/{zone_id}", response_model=ZoneOut)
async def get_zone(zone_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> ZoneOut:
    return zone_out(await get_farm_zone(session, farm, zone_id))


@router.patch("/{zone_id}", response_model=ZoneOut)
async def update_zone(
    zone_id: uuid.UUID, payload: ZoneUpdate, farm: CurrentFarm, session: DbSession
) -> ZoneOut:
    zone = await get_farm_zone(session, farm, zone_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(zone, field, value)
    if zone.dry_threshold >= zone.wet_threshold:
        raise ValidationRuleError("O limiar de solo seco deve ser menor que o de solo úmido.")
    await session.commit()
    await session.refresh(zone)
    return zone_out(zone)


@router.delete("/{zone_id}", status_code=204)
async def archive_zone(zone_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> Response:
    """Arquiva a zona (preserva o histórico) e desvincula seus sensores."""
    zone = await get_farm_zone(session, farm, zone_id)
    zone.archived_at = utcnow()
    await session.execute(update(Device).where(Device.zone_id == zone.id).values(zone_id=None))
    await session.commit()
    return Response(status_code=204)


@router.get("/{zone_id}/readings", response_model=list[ReadingOut])
async def zone_readings(
    zone_id: uuid.UUID,
    farm: CurrentFarm,
    session: DbSession,
    hours: Annotated[int, Query(ge=1, le=168)] = 8,
) -> list[ReadingOut]:
    zone = await get_farm_zone(session, farm, zone_id, active_only=False)
    since = utcnow() - timedelta(hours=hours)
    rows = (
        await session.execute(
            select(Reading.recorded_at, Reading.moisture_pct, Reading.temperature_c)
            .where(Reading.zone_id == zone.id, Reading.recorded_at >= since)
            .order_by(Reading.recorded_at)
            .limit(1000)
        )
    ).all()
    return [ReadingOut(recorded_at=r, moisture_pct=m, temperature_c=t) for r, m, t in rows]
