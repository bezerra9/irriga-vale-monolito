"""Processa uma leitura enviada por um sensor e aplica as regras de irrigação."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ValidationRuleError
from app.models import (
    AlertKind,
    Device,
    Farm,
    Irrigation,
    IrrigationOrigin,
    IrrigationStatus,
    Reading,
    Zone,
)
from app.schemas import IngestOut, ReadingIn
from app.services import rules
from app.services.alerts import create_alert
from app.services.irrigation import open_irrigation_for_zone
from app.services.mappers import offline_window
from app.services.time_utils import ensure_utc, next_window, utcnow
from app.services.zone_status import compute_zone_status

MAX_CLOCK_SKEW = timedelta(minutes=5)
WARNING_COOLDOWN = timedelta(hours=12)
TARGET_COOLDOWN = timedelta(hours=2)
BATTERY_COOLDOWN = timedelta(hours=24)


async def ingest_reading(session: AsyncSession, device: Device, payload: ReadingIn) -> IngestOut:
    now = utcnow()
    critical_cooldown = timedelta(hours=get_settings().alert_cooldown_hours)
    recorded_at = ensure_utc(payload.recorded_at) if payload.recorded_at else now
    if recorded_at > now + MAX_CLOCK_SKEW:
        raise ValidationRuleError("Leitura com data no futuro. Verifique o relógio do sensor.")

    device.last_seen_at = now
    owner = await session.get(Farm, device.farm_id)
    next_reading_in_s = (owner.reading_interval_min if owner else 10) * 60
    if payload.battery_pct is not None:
        device.battery_pct = payload.battery_pct
    if payload.signal_dbm is not None:
        device.signal_dbm = payload.signal_dbm

    zone = await session.get(Zone, device.zone_id) if device.zone_id else None
    session.add(
        Reading(
            device_id=device.id,
            zone_id=zone.id if zone else None,
            moisture_pct=payload.moisture_pct,
            temperature_c=payload.temperature_c,
            battery_pct=payload.battery_pct,
            recorded_at=recorded_at,
        )
    )

    if zone is None or zone.archived_at is not None:
        await session.commit()
        return IngestOut(
            zone_status=None,
            irrigation_recommended=False,
            next_reading_in_s=next_reading_in_s,
        )

    # Leituras antigas (ex.: fila do sensor) não devem sobrescrever o estado atual.
    if zone.last_reading_at is None or recorded_at >= zone.last_reading_at:
        zone.last_moisture_pct = payload.moisture_pct
        zone.last_temperature_c = payload.temperature_c
        zone.last_reading_at = recorded_at

    farm = await session.get(Farm, zone.farm_id)
    assert farm is not None
    moisture = payload.moisture_pct
    recommended = False

    if rules.is_low_battery(payload.battery_pct):
        await create_alert(
            session,
            farm,
            AlertKind.device,
            f"Bateria baixa no sensor {device.code} ({payload.battery_pct}%).",
            zone_id=zone.id,
            device_id=device.id,
            cooldown=BATTERY_COOLDOWN,
            now=now,
        )

    open_irrigation = await open_irrigation_for_zone(session, zone.id)

    if (
        open_irrigation is not None
        and open_irrigation.status == IrrigationStatus.in_progress
        and rules.target_reached(moisture, zone.wet_threshold)
    ):
        await create_alert(
            session,
            farm,
            AlertKind.info,
            f"{zone.name} atingiu a umidade alvo ({moisture:.0f}%). "
            "Você pode encerrar a irrigação.",
            zone_id=zone.id,
            cooldown=TARGET_COOLDOWN,
            now=now,
        )

    if rules.needs_irrigation(moisture, zone.dry_threshold, zone.management):
        if open_irrigation is None:
            scheduled = next_window(farm.timezone, farm.irrigation_window_start, now)
            irrigation = Irrigation(
                zone_id=zone.id,
                origin=IrrigationOrigin.system,
                status=IrrigationStatus.approved
                if farm.auto_approve
                else IrrigationStatus.recommended,
                scheduled_at=scheduled,
                duration_min=45,
                volume_l_estimated=rules.estimate_volume_l(zone.area_ha, 45),
                reason=f"Umidade em {moisture:.0f}% (limiar {zone.dry_threshold}%)",
            )
            session.add(irrigation)
            recommended = True
        await create_alert(
            session,
            farm,
            AlertKind.critical,
            f"{zone.name} com {moisture:.0f}% de umidade. Irrigação necessária.",
            zone_id=zone.id,
            cooldown=critical_cooldown,
            now=now,
        )
    elif rules.is_warning(moisture, zone.dry_threshold, zone.management):
        await create_alert(
            session,
            farm,
            AlertKind.warning,
            f"{zone.name} abaixo do ideal ({moisture:.0f}%). Monitore a situação.",
            zone_id=zone.id,
            cooldown=WARNING_COOLDOWN,
            now=now,
        )

    await session.commit()
    status = compute_zone_status(
        moisture=zone.last_moisture_pct,
        last_reading_at=zone.last_reading_at,
        dry_threshold=zone.dry_threshold,
        wet_threshold=zone.wet_threshold,
        management=zone.management,
        now=now,
        offline_after=offline_window(),
    )
    return IngestOut(
        zone_status=status.value,
        irrigation_recommended=recommended,
        next_reading_in_s=next_reading_in_s,
    )
