from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime) -> datetime:
    """Datas sem fuso são tratadas como UTC; as demais são convertidas para UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def local_now(tz_name: str, now: datetime | None = None) -> datetime:
    return (now or utcnow()).astimezone(ZoneInfo(tz_name))


def local_datetime_to_utc(tz_name: str, day, at: time) -> datetime:
    """Combina uma data local com um horário local e devolve o instante em UTC."""
    tz = ZoneInfo(tz_name)
    return datetime.combine(day, at, tzinfo=tz).astimezone(UTC)


def next_window(tz_name: str, window_start: time, after: datetime) -> datetime:
    """Próxima janela (horário local `window_start`) em UTC, estritamente após `after`."""
    local = after.astimezone(ZoneInfo(tz_name))
    candidate = local_datetime_to_utc(tz_name, local.date(), window_start)
    if candidate <= after:
        candidate = local_datetime_to_utc(tz_name, local.date() + timedelta(days=1), window_start)
    return candidate


def day_bounds_utc(tz_name: str, now: datetime) -> tuple[datetime, datetime]:
    """Início e fim (UTC) do dia local corrente."""
    local_date = local_now(tz_name, now).date()
    start = local_datetime_to_utc(tz_name, local_date, time(0, 0))
    end = local_datetime_to_utc(tz_name, local_date + timedelta(days=1), time(0, 0))
    return start, end


def in_quiet_hours(current: time, start: time, end: time) -> bool:
    """Verifica se `current` cai na janela de silêncio, inclusive quando ela cruza a meia-noite."""
    if start == end:
        return False
    if start < end:
        return start <= current < end
    return current >= start or current < end
