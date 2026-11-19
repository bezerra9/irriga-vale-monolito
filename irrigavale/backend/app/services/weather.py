"""Clima atual da fazenda via Open-Meteo (gratuito, sem chave de API).

Qualquer falha devolve None: o clima é informativo e nunca deve derrubar o painel.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Farm
from app.schemas import WeatherOut
from app.services.time_utils import utcnow

logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_TTL = timedelta(minutes=30)
TIMEOUT_S = 5.0


@dataclass
class _CacheEntry:
    key: tuple[float, float]
    value: WeatherOut
    expires_at: datetime


_cache: dict[uuid.UUID, _CacheEntry] = {}


def describe_weather_code(code: int, is_day: bool) -> tuple[str, str]:
    """Converte o código WMO do Open-Meteo em (condição em pt-BR, ícone)."""
    if code in (0, 1):
        return ("Ensolarado", "sunny") if is_day else ("Céu limpo", "night")
    if code == 2:
        return "Parcialmente nublado", "partly"
    if code == 3:
        return "Nublado", "cloudy"
    if code in (45, 48):
        return "Neblina", "fog"
    if 51 <= code <= 57:
        return "Chuvisco", "rain"
    if 61 <= code <= 67 or 80 <= code <= 82 or 71 <= code <= 77 or code in (85, 86):
        return "Chuva", "rain"
    if code >= 95:
        return "Tempestade", "storm"
    return "Nublado", "cloudy"


async def _geocode(client: httpx.AsyncClient, farm: Farm) -> tuple[float, float] | None:
    response = await client.get(
        GEOCODING_URL,
        params={"name": farm.city, "count": 1, "language": "pt", "country_code": "BR"},
    )
    response.raise_for_status()
    results = response.json().get("results") or []
    if not results:
        return None
    return float(results[0]["latitude"]), float(results[0]["longitude"])


async def _fetch(client: httpx.AsyncClient, lat: float, lon: float, tz: str) -> WeatherOut:
    response = await client.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,uv_index,"
            "precipitation,weather_code,is_day",
            "wind_speed_unit": "kmh",
            "timezone": tz,
        },
    )
    response.raise_for_status()
    current = response.json()["current"]
    condition, icon = describe_weather_code(
        int(current.get("weather_code") or 0), bool(current.get("is_day", 1))
    )
    return WeatherOut(
        temperature_c=float(current["temperature_2m"]),
        humidity_pct=int(round(current.get("relative_humidity_2m") or 0)),
        wind_kmh=float(current.get("wind_speed_10m") or 0),
        uv_index=float(current.get("uv_index") or 0),
        precipitation_mm=float(current.get("precipitation") or 0),
        condition=condition,
        icon=icon,
        updated_at=utcnow(),
    )


async def get_weather(session: AsyncSession, farm: Farm) -> WeatherOut | None:
    if not get_settings().weather_enabled:
        return None
    now = utcnow()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            if farm.latitude is None or farm.longitude is None:
                coords = await _geocode(client, farm)
                if coords is None:
                    return None
                farm.latitude, farm.longitude = coords
                await session.commit()
            key = (farm.latitude, farm.longitude)
            cached = _cache.get(farm.id)
            if cached and cached.key == key and cached.expires_at > now:
                return cached.value
            value = await _fetch(client, key[0], key[1], farm.timezone)
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        logger.warning("Clima indisponível para a fazenda %s", farm.id, exc_info=True)
        return None
    _cache[farm.id] = _CacheEntry(key=key, value=value, expires_at=now + CACHE_TTL)
    return value
