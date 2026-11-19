from datetime import timedelta

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Alert, Irrigation
from app.services.time_utils import utcnow
from tests.conftest import create_device, create_zone, register, send_reading


async def _setup(farmer, **zone_overrides):
    zone = await create_zone(farmer, **zone_overrides)
    device = await create_device(farmer, zone["id"])
    return zone, device


async def test_sensor_endpoint_requires_device_key(farmer):
    zone, _ = await _setup(farmer)
    response = await farmer.client.post(
        "/api/v1/ingest/readings", json={"moisture_pct": 40, "battery_pct": 90}
    )
    assert response.status_code == 401
    response = await farmer.client.post(
        "/api/v1/ingest/readings",
        json={"moisture_pct": 40},
        headers={"X-Device-Key": "irv_chave_errada"},
    )
    assert response.status_code == 401


async def test_dry_reading_creates_recommendation_and_critical_alert(farmer):
    zone, device = await _setup(farmer, dry_threshold=30)
    result = await send_reading(farmer, device["api_key"], moisture_pct=22)

    assert result["irrigation_recommended"] is True
    assert result["zone_status"] == "dry"

    agenda = (await farmer.client.get("/api/v1/irrigations", headers=farmer.headers)).json()
    assert len(agenda) == 1
    assert agenda[0]["status"] == "recommended"
    assert agenda[0]["origin"] == "system"
    assert agenda[0]["reason"].startswith("Umidade em 22%")

    alerts = (await farmer.client.get("/api/v1/alerts", headers=farmer.headers)).json()
    assert [a["kind"] for a in alerts] == ["critical"]


async def test_repeated_dry_readings_do_not_duplicate_recommendation_or_alert(farmer):
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=20)
    second = await send_reading(farmer, device["api_key"], moisture_pct=19)

    assert second["irrigation_recommended"] is False
    async with SessionLocal() as session:
        irrigations = await session.scalar(select(func.count(Irrigation.id)))
        alerts = await session.scalar(select(func.count(Alert.id)))
    assert irrigations == 1
    assert alerts == 1


async def test_auto_approve_creates_approved_recommendation(farmer):
    await farmer.client.patch("/api/v1/farm", json={"auto_approve": True}, headers=farmer.headers)
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=20)

    agenda = (await farmer.client.get("/api/v1/irrigations", headers=farmer.headers)).json()
    assert agenda[0]["status"] == "approved"


async def test_planned_stress_zone_is_not_flagged_as_dry(farmer):
    zone, device = await _setup(farmer, management="planned_stress")
    result = await send_reading(farmer, device["api_key"], moisture_pct=10)

    assert result["irrigation_recommended"] is False
    assert result["zone_status"] == "planned_stress"


async def test_old_reading_does_not_overwrite_current_state(farmer):
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=55)
    old_time = (utcnow() - timedelta(hours=2)).isoformat()
    await send_reading(farmer, device["api_key"], moisture_pct=15, recorded_at=old_time)

    zones = (await farmer.client.get("/api/v1/zones", headers=farmer.headers)).json()
    assert zones[0]["last_moisture_pct"] == 55


async def test_future_timestamp_is_rejected(farmer):
    zone, device = await _setup(farmer)
    future = (utcnow() + timedelta(hours=1)).isoformat()
    response = await farmer.client.post(
        "/api/v1/ingest/readings",
        json={"moisture_pct": 40, "recorded_at": future},
        headers={"X-Device-Key": device["api_key"]},
    )
    assert response.status_code == 422


async def test_low_battery_creates_device_alert_once(farmer):
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=50, battery_pct=15)
    await send_reading(farmer, device["api_key"], moisture_pct=50, battery_pct=14)

    alerts = (await farmer.client.get("/api/v1/alerts", headers=farmer.headers)).json()
    assert [a["kind"] for a in alerts] == ["device"]
    assert "Bateria baixa" in alerts[0]["message"]


async def test_rotated_key_invalidates_old_key(farmer):
    zone, device = await _setup(farmer)
    rotated = await farmer.client.post(
        f"/api/v1/devices/{device['id']}/rotate-key", headers=farmer.headers
    )
    assert rotated.status_code == 200
    old = await farmer.client.post(
        "/api/v1/ingest/readings",
        json={"moisture_pct": 40},
        headers={"X-Device-Key": device["api_key"]},
    )
    assert old.status_code == 401
    new = await farmer.client.post(
        "/api/v1/ingest/readings",
        json={"moisture_pct": 40},
        headers={"X-Device-Key": rotated.json()["api_key"]},
    )
    assert new.status_code == 202


async def test_dashboard_reflects_zone_state_and_active_irrigation(farmer):
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=22)

    dashboard = (await farmer.client.get("/api/v1/dashboard", headers=farmer.headers)).json()
    assert dashboard["zones"][0]["status"] == "dry"
    assert dashboard["unread_alerts"] == 1
    assert dashboard["active_irrigations"][0]["status"] == "recommended"
    assert dashboard["water_goal_l"] == 8000


async def test_critical_alert_sends_sms_when_enabled(farmer):
    await farmer.client.patch(
        "/api/v1/farm",
        json={
            "sms_enabled": True,
            "sms_phone": "+5587999998888",
            # Janela de silêncio vazia (início == fim) => SMS liberado em qualquer horário.
            "quiet_hours_start": "00:00:00",
            "quiet_hours_end": "00:00:00",
        },
        headers=farmer.headers,
    )
    zone, device = await _setup(farmer)
    await send_reading(farmer, device["api_key"], moisture_pct=18)

    alerts = (await farmer.client.get("/api/v1/alerts", headers=farmer.headers)).json()
    assert alerts[0]["sms_sent"] is True


async def test_sms_requires_phone_number(farmer):
    response = await farmer.client.patch(
        "/api/v1/farm", json={"sms_enabled": True}, headers=farmer.headers
    )
    assert response.status_code == 422


async def test_removed_sensor_stops_working_and_can_be_paired_again(farmer):
    zone = await create_zone(farmer)
    device = await create_device(farmer, zone["id"])
    await send_reading(farmer, device["api_key"])

    removed = await farmer.client.delete(f"/api/v1/devices/{device['id']}", headers=farmer.headers)
    assert removed.status_code == 204
    listed = (await farmer.client.get("/api/v1/devices", headers=farmer.headers)).json()
    assert listed == []
    old_key = await farmer.client.post(
        "/api/v1/ingest/readings",
        json={"moisture_pct": 50},
        headers={"X-Device-Key": device["api_key"]},
    )
    assert old_key.status_code == 401

    # O mesmo aparelho (mesmo código) pode ser pareado de novo, com chave nova.
    again = await create_device(farmer, zone["id"])
    assert again["id"] == device["id"]
    assert again["api_key"] != device["api_key"]
    assert (await send_reading(farmer, again["api_key"]))["accepted"] is True

    # Outra fazenda não pode usar o código de um sensor alheio, mesmo removido.
    await farmer.client.delete(f"/api/v1/devices/{again['id']}", headers=farmer.headers)
    other = await register(farmer.client, "outro@fazendateste.com.br")
    conflict = await other.client.post(
        "/api/v1/devices",
        json={"code": "ESP32-0001", "name": "Sensor", "zone_id": None},
        headers=other.headers,
    )
    assert conflict.status_code == 409
