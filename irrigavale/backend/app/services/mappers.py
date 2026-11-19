"""Conversão de modelos ORM para os schemas de saída."""

from datetime import datetime, timedelta

from app.core.config import get_settings
from app.models import Device, Irrigation, Routine, Zone
from app.schemas import AlertOut, DeviceOut, IrrigationOut, RoutineOut, ZoneOut
from app.services.time_utils import utcnow
from app.services.zone_status import ZoneStatus, compute_zone_status


def offline_window() -> timedelta:
    return timedelta(minutes=get_settings().offline_after_minutes)


def zone_out(zone: Zone, now: datetime | None = None) -> ZoneOut:
    status = compute_zone_status(
        moisture=zone.last_moisture_pct,
        last_reading_at=zone.last_reading_at,
        dry_threshold=zone.dry_threshold,
        wet_threshold=zone.wet_threshold,
        management=zone.management,
        now=now or utcnow(),
        offline_after=offline_window(),
    )
    return ZoneOut(
        id=zone.id,
        name=zone.name,
        crop=zone.crop,
        area_ha=zone.area_ha,
        dry_threshold=zone.dry_threshold,
        wet_threshold=zone.wet_threshold,
        management=zone.management,
        status=ZoneStatus(status).value,
        last_moisture_pct=zone.last_moisture_pct,
        last_temperature_c=zone.last_temperature_c,
        last_reading_at=zone.last_reading_at,
    )


def device_out(device: Device, now: datetime | None = None) -> DeviceOut:
    now = now or utcnow()
    if device.last_seen_at is None:
        connection = "never"
    elif now - device.last_seen_at > offline_window():
        connection = "offline"
    else:
        connection = "online"
    return DeviceOut(
        id=device.id,
        code=device.code,
        name=device.name,
        zone_id=device.zone_id,
        battery_pct=device.battery_pct,
        signal_dbm=device.signal_dbm,
        last_seen_at=device.last_seen_at,
        connection=connection,
        created_at=device.created_at,
    )


def irrigation_out(irrigation: Irrigation, zone_name: str) -> IrrigationOut:
    return IrrigationOut(
        id=irrigation.id,
        zone_id=irrigation.zone_id,
        zone_name=zone_name,
        routine_id=irrigation.routine_id,
        origin=irrigation.origin,
        status=irrigation.status,
        scheduled_at=irrigation.scheduled_at,
        started_at=irrigation.started_at,
        finished_at=irrigation.finished_at,
        duration_min=irrigation.duration_min,
        volume_l_estimated=irrigation.volume_l_estimated,
        volume_l_actual=irrigation.volume_l_actual,
        reason=irrigation.reason,
    )


def routine_out(routine: Routine, zone_name: str) -> RoutineOut:
    return RoutineOut(
        id=routine.id,
        zone_id=routine.zone_id,
        zone_name=zone_name,
        weekdays=[d for d in range(7) if routine.weekdays & (1 << d)],
        start_time=routine.start_time,
        duration_min=routine.duration_min,
        respect_sensor=routine.respect_sensor,
        moisture_limit=routine.moisture_limit,
        active=routine.active,
    )


def alert_out(alert, zone_name: str | None) -> AlertOut:
    return AlertOut(
        id=alert.id,
        zone_id=alert.zone_id,
        zone_name=zone_name,
        kind=alert.kind,
        message=alert.message,
        sms_sent=alert.sms_sent,
        created_at=alert.created_at,
        read_at=alert.read_at,
    )


def weekdays_to_mask(days: list[int]) -> int:
    mask = 0
    for day in days:
        mask |= 1 << day
    return mask
