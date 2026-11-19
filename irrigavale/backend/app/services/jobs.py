"""Tarefas periódicas executadas dentro do processo da API (arquitetura monolítica)."""

import asyncio
import logging
from contextlib import suppress
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.models import AlertKind, Device, Farm
from app.services.alerts import create_alert
from app.services.mappers import offline_window
from app.services.routines import run_due_routines
from app.services.time_utils import utcnow

logger = logging.getLogger(__name__)

DEVICE_ALERT_COOLDOWN = timedelta(hours=12)


async def check_offline_devices(session: AsyncSession, now: datetime | None = None) -> int:
    now = now or utcnow()
    threshold = now - offline_window()
    rows = (
        await session.execute(
            select(Device, Farm)
            .join(Farm, Farm.id == Device.farm_id)
            .where(
                Device.revoked_at.is_(None),
                Device.last_seen_at.is_not(None),
                Device.last_seen_at < threshold,
            )
        )
    ).all()

    created = 0
    for device, farm in rows:
        minutes = int((now - device.last_seen_at).total_seconds() // 60)
        alert = await create_alert(
            session,
            farm,
            AlertKind.device,
            f"Sensor {device.code} sem dados há {minutes} min.",
            zone_id=device.zone_id,
            device_id=device.id,
            cooldown=DEVICE_ALERT_COOLDOWN,
            now=now,
        )
        if alert is not None:
            created += 1
    await session.commit()
    return created


async def run_scheduler(stop: asyncio.Event, interval_seconds: float = 30) -> None:
    """Loop do agendador. Erros são registrados e não derrubam o processo."""
    while not stop.is_set():
        try:
            async with SessionLocal() as session:
                await run_due_routines(session)
            async with SessionLocal() as session:
                await check_offline_devices(session)
        except Exception:
            logger.exception("Falha ao executar tarefas agendadas")
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
