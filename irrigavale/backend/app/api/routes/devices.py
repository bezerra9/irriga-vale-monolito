import uuid

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.deps import CurrentFarm, DbSession
from app.core.errors import ConflictError
from app.core.security import generate_device_key, hash_device_key
from app.models import Device
from app.schemas import DeviceCreatedOut, DeviceIn, DeviceOut, DeviceUpdate
from app.services.access import get_farm_device, get_farm_zone
from app.services.mappers import device_out
from app.services.time_utils import utcnow

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
async def list_devices(farm: CurrentFarm, session: DbSession) -> list[DeviceOut]:
    devices = (
        (
            await session.execute(
                select(Device)
                .where(Device.farm_id == farm.id, Device.revoked_at.is_(None))
                .order_by(Device.code)
            )
        )
        .scalars()
        .all()
    )
    now = utcnow()
    return [device_out(d, now) for d in devices]


@router.post("", status_code=201, response_model=DeviceCreatedOut)
async def create_device(
    payload: DeviceIn, farm: CurrentFarm, session: DbSession
) -> DeviceCreatedOut:
    code = payload.code.upper()
    existing = await session.scalar(select(Device).where(Device.code == code))
    # Um sensor removido desta fazenda pode ser pareado de novo (mesmo aparelho físico).
    reusable = (
        existing is not None and existing.revoked_at is not None and existing.farm_id == farm.id
    )
    if existing is not None and not reusable:
        raise ConflictError("Já existe um sensor com este código.")
    if payload.zone_id is not None:
        await get_farm_zone(session, farm, payload.zone_id)

    api_key = generate_device_key()
    if reusable:
        assert existing is not None
        device = existing
        device.zone_id = payload.zone_id
        device.name = payload.name
        device.key_hash = hash_device_key(api_key)
        device.revoked_at = None
        device.battery_pct = None
        device.signal_dbm = None
        device.last_seen_at = None
    else:
        device = Device(
            farm_id=farm.id,
            zone_id=payload.zone_id,
            code=code,
            name=payload.name,
            key_hash=hash_device_key(api_key),
        )
        session.add(device)
    await session.commit()
    await session.refresh(device)
    return DeviceCreatedOut(**device_out(device).model_dump(), api_key=api_key)


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> DeviceOut:
    return device_out(await get_farm_device(session, farm, device_id))


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: uuid.UUID, payload: DeviceUpdate, farm: CurrentFarm, session: DbSession
) -> DeviceOut:
    device = await get_farm_device(session, farm, device_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        device.name = changes["name"]
    if "zone_id" in changes:
        if changes["zone_id"] is not None:
            await get_farm_zone(session, farm, changes["zone_id"])
        device.zone_id = changes["zone_id"]
    await session.commit()
    await session.refresh(device)
    return device_out(device)


@router.post("/{device_id}/rotate-key", response_model=DeviceCreatedOut)
async def rotate_key(
    device_id: uuid.UUID, farm: CurrentFarm, session: DbSession
) -> DeviceCreatedOut:
    """Gera nova chave. A antiga deixa de funcionar imediatamente."""
    device = await get_farm_device(session, farm, device_id)
    api_key = generate_device_key()
    device.key_hash = hash_device_key(api_key)
    await session.commit()
    await session.refresh(device)
    return DeviceCreatedOut(**device_out(device).model_dump(), api_key=api_key)


@router.delete("/{device_id}", status_code=204)
async def revoke_device(device_id: uuid.UUID, farm: CurrentFarm, session: DbSession) -> Response:
    device = await get_farm_device(session, farm, device_id)
    device.revoked_at = utcnow()
    device.zone_id = None
    await session.commit()
    return Response(status_code=204)
