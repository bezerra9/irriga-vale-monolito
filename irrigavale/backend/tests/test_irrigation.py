import uuid
from datetime import timedelta

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Irrigation
from app.services.time_utils import utcnow
from tests.conftest import create_device, create_zone, register, send_reading


async def _recommended(farmer):
    zone = await create_zone(farmer)
    device = await create_device(farmer, zone["id"])
    await send_reading(farmer, device["api_key"], moisture_pct=20)
    agenda = (await farmer.client.get("/api/v1/irrigations", headers=farmer.headers)).json()
    return zone, device, agenda[0]


async def _action(farmer, irrigation_id, action, **body):
    return await farmer.client.post(
        f"/api/v1/irrigations/{irrigation_id}/{action}", json=body or None, headers=farmer.headers
    )


async def test_approve_then_start_then_finish_with_volume(farmer):
    _, _, irrigation = await _recommended(farmer)

    approved = await _action(farmer, irrigation["id"], "approve")
    assert approved.json()["status"] == "approved"

    started = await _action(farmer, irrigation["id"], "start")
    assert started.json()["status"] == "in_progress"
    assert started.json()["started_at"] is not None

    finished = await _action(farmer, irrigation["id"], "finish", volume_l=2100)
    body = finished.json()
    assert body["status"] == "done"
    assert body["volume_l_actual"] == 2100

    dashboard = (await farmer.client.get("/api/v1/dashboard", headers=farmer.headers)).json()
    assert dashboard["water_used_today_l"] == 2100
    assert dashboard["active_irrigations"] == []

    alerts = (await farmer.client.get("/api/v1/alerts", headers=farmer.headers)).json()
    assert any(a["kind"] == "done" and "2.100 L" in a["message"] for a in alerts)


async def test_finish_without_volume_uses_estimate_from_elapsed_time(farmer):
    zone = await create_zone(farmer, area_ha=2.0)
    created = await farmer.client.post(
        "/api/v1/irrigations",
        json={"zone_id": zone["id"], "duration_min": 45},
        headers=farmer.headers,
    )
    assert created.status_code == 201, created.text
    irrigation = created.json()

    # Simula 30 minutos de irrigação.
    async with SessionLocal() as session:
        row = await session.get(Irrigation, uuid.UUID(irrigation["id"]))
        row.started_at = utcnow() - timedelta(minutes=30)
        await session.commit()

    body = (await _action(farmer, irrigation["id"], "finish")).json()
    # 2 ha x 1.500 L/ha/h x 0,5 h
    assert body["volume_l_actual"] == 1500
    alerts = (await farmer.client.get("/api/v1/alerts", headers=farmer.headers)).json()
    assert any(a["kind"] == "done" and "1.500 L (estimado)" in a["message"] for a in alerts)


async def test_invalid_transition_returns_409(farmer):
    _, _, irrigation = await _recommended(farmer)
    response = await _action(farmer, irrigation["id"], "finish")
    assert response.status_code == 409
    assert "recomendada" in response.json()["detail"]


async def test_only_one_irrigation_in_progress_per_zone(farmer):
    zone, device, first = await _recommended(farmer)
    await _action(farmer, first["id"], "start")

    manual = await farmer.client.post(
        "/api/v1/irrigations",
        json={"zone_id": zone["id"], "duration_min": 30},
        headers=farmer.headers,
    )
    assert manual.status_code == 409


async def test_postpone_moves_to_future_window(farmer):
    _, _, irrigation = await _recommended(farmer)
    response = await _action(farmer, irrigation["id"], "postpone")
    body = response.json()
    assert body["status"] == "postponed"
    assert body["scheduled_at"] > irrigation["scheduled_at"]
    # Sempre cai numa janela às 05:00 local (08:00 UTC em Recife).
    assert body["scheduled_at"].endswith("08:00:00Z")


async def test_manual_irrigation_is_recorded_in_progress(farmer):
    zone = await create_zone(farmer)
    response = await farmer.client.post(
        "/api/v1/irrigations",
        json={"zone_id": zone["id"], "duration_min": 60},
        headers=farmer.headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["origin"] == "manual"
    assert body["status"] == "in_progress"
    assert body["volume_l_estimated"] == 3000  # 2 ha * 1500 L/h * 1 h


async def test_other_farm_cannot_touch_irrigation(farmer, client):
    _, _, irrigation = await _recommended(farmer)
    intruder = await register(client, "intruso@outrateste.com.br", farm_name="Outra Fazenda")
    response = await _action(intruder, irrigation["id"], "approve")
    assert response.status_code == 404

    async with SessionLocal() as session:
        row = await session.scalar(select(Irrigation).where(Irrigation.id == irrigation["id"]))
        assert row.status.value == "recommended"
