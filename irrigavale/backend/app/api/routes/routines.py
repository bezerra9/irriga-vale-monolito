import uuid

from fastapi import APIRouter, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentFarm, DbSession
from app.core.errors import NotFoundError
from app.models import Routine, Zone
from app.schemas import RoutineIn, RoutineOut, RoutineUpdate
from app.services.access import get_farm_zone
from app.services.mappers import routine_out, weekdays_to_mask

router = APIRouter(prefix="/routines", tags=["routines"])


async def _get_routine(session: AsyncSession, farm, routine_id: uuid.UUID) -> tuple[Routine, Zone]:
    row = (
        await session.execute(
            select(Routine, Zone)
            .join(Zone, Zone.id == Routine.zone_id)
            .where(Routine.id == routine_id, Zone.farm_id == farm.id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Rotina não encontrada.")
    return row


@router.get("", response_model=list[RoutineOut])
async def list_routines(farm: CurrentFarm, session: DbSession) -> list[RoutineOut]:
    rows = (
        await session.execute(
            select(Routine, Zone.name)
            .join(Zone, Zone.id == Routine.zone_id)
            .where(Zone.farm_id == farm.id, Zone.archived_at.is_(None))
            .order_by(Routine.start_time)
        )
    ).all()
    return [routine_out(r, name) for r, name in rows]


@router.post("", status_code=201, response_model=RoutineOut)
async def create_routine(payload: RoutineIn, farm: CurrentFarm, session: DbSession) -> RoutineOut:
    zone = await get_farm_zone(session, farm, payload.zone_id)
    routine = Routine(
        zone_id=zone.id,
        weekdays=weekdays_to_mask(payload.weekdays),
        start_time=payload.start_time,
        duration_min=payload.duration_min,
        respect_sensor=payload.respect_sensor,
        moisture_limit=payload.moisture_limit,
        active=payload.active,
    )
    session.add(routine)
    await session.commit()
    await session.refresh(routine)
    return routine_out(routine, zone.name)


@router.patch("/{routine_id}", response_model=RoutineOut)
async def update_routine(
    routine_id: uuid.UUID, payload: RoutineUpdate, farm: CurrentFarm, session: DbSession
) -> RoutineOut:
    routine, zone = await _get_routine(session, farm, routine_id)
    changes = payload.model_dump(exclude_unset=True)
    if "weekdays" in changes:
        routine.weekdays = weekdays_to_mask(changes.pop("weekdays"))
    for field, value in changes.items():
        setattr(routine, field, value)
    await session.commit()
    await session.refresh(routine)
    return routine_out(routine, zone.name)


@router.delete("/{routine_id}", status_code=204)
async def delete_routine(routine_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> Response:
    routine, _ = await _get_routine(session, farm, routine_id)
    await session.execute(delete(Routine).where(Routine.id == routine.id))
    await session.commit()
    return Response(status_code=204)
