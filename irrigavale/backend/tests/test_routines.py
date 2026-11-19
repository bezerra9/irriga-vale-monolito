from datetime import timedelta

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Irrigation
from app.services.routines import run_due_routines
from app.services.time_utils import local_now, utcnow
from tests.conftest import create_device, create_zone, send_reading


def _today_local():
    """Dia da semana e horário (HH:MM) agora em Recife, para montar uma rotina que dispara já."""
    now = local_now("America/Recife", utcnow())
    return now.weekday(), now.time().replace(second=0, microsecond=0)


async def _routine(farmer, zone_id, *, weekday, start, respect=False, limit=40):
    response = await farmer.client.post(
        "/api/v1/routines",
        json={
            "zone_id": zone_id,
            "weekdays": [weekday],
            "start_time": start.isoformat(),
            "duration_min": 30,
            "respect_sensor": respect,
            "moisture_limit": limit,
        },
        headers=farmer.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _run(now=None) -> int:
    async with SessionLocal() as session:
        return await run_due_routines(session, now=now)


async def test_routine_creates_approved_irrigation_at_its_time(farmer):
    zone = await create_zone(farmer)
    weekday, start = _today_local()
    await _routine(farmer, zone["id"], weekday=weekday, start=start)

    assert await _run() == 1

    agenda = (await farmer.client.get("/api/v1/irrigations", headers=farmer.headers)).json()
    assert agenda[0]["origin"] == "routine"
    assert agenda[0]["status"] == "approved"


async def test_routine_is_idempotent_within_the_same_slot(farmer):
    zone = await create_zone(farmer)
    weekday, start = _today_local()
    await _routine(farmer, zone["id"], weekday=weekday, start=start)

    now = utcnow()
    assert await _run(now) == 1
    assert await _run(now + timedelta(seconds=30)) == 0

    async with SessionLocal() as session:
        count = len((await session.execute(select(Irrigation))).scalars().all())
    assert count == 1


async def test_routine_does_not_run_on_other_weekdays(farmer):
    zone = await create_zone(farmer)
    weekday, start = _today_local()
    await _routine(farmer, zone["id"], weekday=(weekday + 1) % 7, start=start)
    assert await _run() == 0


async def test_routine_skipped_when_soil_is_already_wet(farmer):
    zone = await create_zone(farmer)
    device = await create_device(farmer, zone["id"])
    await send_reading(farmer, device["api_key"], moisture_pct=85)
    weekday, start = _today_local()
    await _routine(farmer, zone["id"], weekday=weekday, start=start, respect=True, limit=40)

    await _run()
    agenda = (await farmer.client.get("/api/v1/irrigations", headers=farmer.headers)).json()
    assert agenda[0]["status"] == "skipped"
    assert "Solo úmido (85%)" in agenda[0]["reason"]


async def test_inactive_routine_is_ignored(farmer):
    zone = await create_zone(farmer)
    weekday, start = _today_local()
    routine = await _routine(farmer, zone["id"], weekday=weekday, start=start)
    await farmer.client.patch(
        f"/api/v1/routines/{routine['id']}", json={"active": False}, headers=farmer.headers
    )
    assert await _run() == 0
