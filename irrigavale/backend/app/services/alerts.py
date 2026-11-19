import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, AlertKind, Farm
from app.services.notifications import SMS_KINDS, send_alert_sms
from app.services.time_utils import local_now, utcnow


async def create_alert(
    session: AsyncSession,
    farm: Farm,
    kind: AlertKind,
    message: str,
    *,
    zone_id: uuid.UUID | None = None,
    device_id: uuid.UUID | None = None,
    cooldown: timedelta | None = None,
    now: datetime | None = None,
) -> Alert | None:
    """Cria um alerta, respeitando um intervalo mínimo entre alertas iguais (anti-spam).

    Retorna None quando o alerta foi suprimido pelo cooldown.
    """
    now = now or utcnow()
    if cooldown is not None:
        query = select(Alert.id).where(
            Alert.farm_id == farm.id,
            Alert.kind == kind,
            Alert.created_at >= now - cooldown,
        )
        if device_id is not None:
            query = query.where(Alert.device_id == device_id)
        else:
            query = query.where(Alert.zone_id == zone_id)
        if (await session.execute(query.limit(1))).first() is not None:
            return None

    alert = Alert(
        farm_id=farm.id,
        zone_id=zone_id,
        device_id=device_id,
        kind=kind,
        message=message,
        created_at=now,
    )
    session.add(alert)
    await session.flush()

    if kind in SMS_KINDS:
        local_time = local_now(farm.timezone, now).time()
        alert.sms_sent = await send_alert_sms(farm, f"IrrigaVale: {message}", local_time)
    return alert
