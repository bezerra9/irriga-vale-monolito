from datetime import datetime, timedelta
from enum import StrEnum

from app.models import ZoneManagement
from app.services.rules import ATTENTION_MARGIN


class ZoneStatus(StrEnum):
    no_data = "no_data"  # zona sem nenhuma leitura ainda
    offline = "offline"  # sem leitura há mais que o tempo limite
    dry = "dry"
    attention = "attention"
    ideal = "ideal"
    wet = "wet"
    planned_stress = "planned_stress"


def compute_zone_status(
    *,
    moisture: float | None,
    last_reading_at: datetime | None,
    dry_threshold: int,
    wet_threshold: int,
    management: ZoneManagement,
    now: datetime,
    offline_after: timedelta,
) -> ZoneStatus:
    if last_reading_at is None or moisture is None:
        return ZoneStatus.no_data
    if now - last_reading_at > offline_after:
        return ZoneStatus.offline
    if management == ZoneManagement.planned_stress:
        return ZoneStatus.planned_stress
    if moisture < dry_threshold:
        return ZoneStatus.dry
    if moisture < dry_threshold + ATTENTION_MARGIN:
        return ZoneStatus.attention
    if moisture > wet_threshold:
        return ZoneStatus.wet
    return ZoneStatus.ideal
