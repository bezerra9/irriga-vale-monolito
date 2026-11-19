"""Clima, resumo/economia e intervalo de leitura."""

from datetime import timedelta

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Irrigation, IrrigationOrigin, IrrigationStatus, User
from app.services.rules import water_savings
from app.services.time_utils import utcnow
from app.services.weather import describe_weather_code
from tests.conftest import create_device, create_zone, register, send_reading


# ---------- Farm ----------
async def test_farm_exposes_new_fields_and_validates_interval(farmer):
    assert farmer.farm["water_price_brl_per_m3"] == 5.0
    assert farmer.farm["reading_interval_min"] == 10
    assert "latitude" not in farmer.farm

    ok = await farmer.client.patch(
        "/api/v1/farm",
        json={"reading_interval_min": 30, "water_price_brl_per_m3": 7.25},
        headers=farmer.headers,
    )
    assert ok.status_code == 200
    assert ok.json()["reading_interval_min"] == 30
    assert ok.json()["water_price_brl_per_m3"] == 7.25

    bad = await farmer.client.patch(
        "/api/v1/farm", json={"reading_interval_min": 7}, headers=farmer.headers
    )
    assert bad.status_code == 422


async def test_changing_city_clears_geocoding_cache(farmer):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == "joao@fazendateste.com.br"))
        from app.models import Farm

        farm = await session.get(Farm, user.farm_id)
        farm.latitude, farm.longitude = -9.39, -40.5
        await session.commit()
        farm_id = farm.id

    await farmer.client.patch("/api/v1/farm", json={"city": "Juazeiro"}, headers=farmer.headers)

    async with SessionLocal() as session:
        from app.models import Farm

        farm = await session.get(Farm, farm_id)
        assert farm.latitude is None and farm.longitude is None


# ---------- Clima ----------
def test_weather_code_mapping():
    assert describe_weather_code(0, True) == ("Ensolarado", "sunny")
    assert describe_weather_code(0, False) == ("Céu limpo", "night")
    assert describe_weather_code(2, True) == ("Parcialmente nublado", "partly")
    assert describe_weather_code(3, True) == ("Nublado", "cloudy")
    assert describe_weather_code(45, True) == ("Neblina", "fog")
    assert describe_weather_code(53, True) == ("Chuvisco", "rain")
    assert describe_weather_code(63, True) == ("Chuva", "rain")
    assert describe_weather_code(81, True) == ("Chuva", "rain")
    assert describe_weather_code(95, True) == ("Tempestade", "storm")


async def test_weather_returns_null_when_disabled(farmer):
    response = await farmer.client.get("/api/v1/weather", headers=farmer.headers)
    assert response.status_code == 200
    assert response.json() is None


# ---------- Economia ----------
def test_water_savings_rule():
    saved, brl = water_savings([1000, None, 500], [(2000, 1500), (1000, 1200), (None, 300)], 6.0)
    # 1000 + 500 puladas + 500 abaixo do estimado; gastar a mais não desconta.
    assert saved == 2000
    assert brl == 12.0


async def test_summary_counts_done_and_skipped(farmer):
    zone = await create_zone(farmer)
    now = utcnow()
    async with SessionLocal() as session:
        session.add_all(
            [
                Irrigation(
                    zone_id=zone["id"],
                    origin=IrrigationOrigin.manual,
                    status=IrrigationStatus.done,
                    scheduled_at=now - timedelta(minutes=50),
                    started_at=now - timedelta(minutes=50),
                    finished_at=now - timedelta(minutes=5),
                    volume_l_estimated=3000,
                    volume_l_actual=2500,
                ),
                Irrigation(
                    zone_id=zone["id"],
                    origin=IrrigationOrigin.routine,
                    status=IrrigationStatus.skipped,
                    scheduled_at=now - timedelta(minutes=30),
                    volume_l_estimated=2000,
                ),
                Irrigation(  # fora do período do mês
                    zone_id=zone["id"],
                    origin=IrrigationOrigin.routine,
                    status=IrrigationStatus.skipped,
                    scheduled_at=now - timedelta(days=40),
                    volume_l_estimated=9999,
                ),
            ]
        )
        await session.commit()

    for period in ("today", "month"):
        body = (
            await farmer.client.get(
                f"/api/v1/stats/summary?period={period}", headers=farmer.headers
            )
        ).json()
        assert body["period"] == period
        assert body["water_used_l"] == 2500
        assert body["irrigations_done"] == 1
        assert body["irrigations_skipped"] == 1
        assert body["water_saved_l"] == 2500
        assert body["savings_brl"] == 12.5  # 2,5 m³ × R$ 5,00

    other = await register(farmer.client, "outra@fazendateste.com.br")
    empty = (await other.client.get("/api/v1/stats/summary", headers=other.headers)).json()
    assert empty["water_saved_l"] == 0 and empty["period"] == "month"


# ---------- Ingestão ----------
async def test_ingest_returns_next_reading_interval(farmer):
    zone = await create_zone(farmer)
    device = await create_device(farmer, zone["id"])
    body = await send_reading(farmer, device["api_key"])
    assert body["next_reading_in_s"] == 600

    await farmer.client.patch(
        "/api/v1/farm", json={"reading_interval_min": 5}, headers=farmer.headers
    )
    loose = await create_device(farmer, None, code="ESP32-0002")
    assert (await send_reading(farmer, loose["api_key"]))["next_reading_in_s"] == 300
