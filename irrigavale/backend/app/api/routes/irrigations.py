import uuid
from typing import Annotated

from fastapi import APIRouter, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentFarm, DbSession
from app.models import Irrigation, IrrigationStatus, Zone
from app.schemas import FinishIn, IrrigationOut, ManualIrrigationIn
from app.services.access import get_farm_zone
from app.services.irrigation import (
    apply_action,
    get_farm_irrigation,
    start_manual_irrigation,
)
from app.services.mappers import irrigation_out

router = APIRouter(prefix="/irrigations", tags=["irrigations"])


@router.get("", response_model=list[IrrigationOut])
async def list_irrigations(
    farm: CurrentFarm,
    session: DbSession,
    status: IrrigationStatus | None = None,
    zone_id: uuid.UUID | None = None,
    limit: int = 50,
) -> list[IrrigationOut]:
    query = (
        select(Irrigation, Zone.name)
        .join(Zone, Zone.id == Irrigation.zone_id)
        .where(Zone.farm_id == farm.id)
        .order_by(Irrigation.scheduled_at.desc())
        .limit(min(max(limit, 1), 200))
    )
    if status is not None:
        query = query.where(Irrigation.status == status)
    if zone_id is not None:
        query = query.where(Irrigation.zone_id == zone_id)
    rows = (await session.execute(query)).all()
    return [irrigation_out(i, name) for i, name in rows]


@router.post("", status_code=201, response_model=IrrigationOut)
async def create_manual(
    payload: ManualIrrigationIn, farm: CurrentFarm, session: DbSession
) -> IrrigationOut:
    zone = await get_farm_zone(session, farm, payload.zone_id)
    irrigation = await start_manual_irrigation(
        session, farm, zone, duration_min=payload.duration_min, started_at=payload.started_at
    )
    return irrigation_out(irrigation, zone.name)


async def _act(
    session: AsyncSession, farm, irrigation_id: uuid.UUID, action: str, **kwargs
) -> IrrigationOut:
    irrigation = await get_farm_irrigation(session, farm, irrigation_id)
    irrigation = await apply_action(session, farm, irrigation, action, **kwargs)
    zone = await session.get(Zone, irrigation.zone_id)
    assert zone is not None
    return irrigation_out(irrigation, zone.name)


@router.post("/{irrigation_id}/approve", response_model=IrrigationOut)
async def approve(irrigation_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> IrrigationOut:
    return await _act(session, farm, irrigation_id, "approve")


@router.post("/{irrigation_id}/postpone", response_model=IrrigationOut)
async def postpone(
    irrigation_id: uuid.UUID, farm: CurrentFarm, session: DbSession
) -> IrrigationOut:
    return await _act(session, farm, irrigation_id, "postpone")


@router.post("/{irrigation_id}/start", response_model=IrrigationOut)
async def start(irrigation_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> IrrigationOut:
    return await _act(session, farm, irrigation_id, "start")


@router.post("/{irrigation_id}/finish", response_model=IrrigationOut)
async def finish(
    irrigation_id: uuid.UUID,
    farm: CurrentFarm,
    session: DbSession,
    payload: Annotated[FinishIn | None, Body()] = None,
) -> IrrigationOut:
    volume = payload.volume_l if payload else None
    return await _act(session, farm, irrigation_id, "finish", volume_l=volume)


@router.post("/{irrigation_id}/cancel", response_model=IrrigationOut)
async def cancel(irrigation_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> IrrigationOut:
    return await _act(session, farm, irrigation_id, "cancel")
