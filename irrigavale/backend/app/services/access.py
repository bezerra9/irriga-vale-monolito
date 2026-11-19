"""Busca de recursos sempre restrita à fazenda do usuário autenticado."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models import Device, Farm, Zone


async def get_farm_zone(
    session: AsyncSession, farm: Farm, zone_id: uuid.UUID, *, active_only=True
) -> Zone:
    query = select(Zone).where(Zone.id == zone_id, Zone.farm_id == farm.id)
    if active_only:
        query = query.where(Zone.archived_at.is_(None))
    zone = (await session.execute(query)).scalar_one_or_none()
    if zone is None:
        raise NotFoundError("Zona não encontrada.")
    return zone


async def get_farm_device(session: AsyncSession, farm: Farm, device_id: uuid.UUID) -> Device:
    device = (
        await session.execute(
            select(Device).where(Device.id == device_id, Device.farm_id == farm.id)
        )
    ).scalar_one_or_none()
    if device is None or device.revoked_at is not None:
        raise NotFoundError("Sensor não encontrado.")
    return device
