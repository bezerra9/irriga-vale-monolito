"""Fixtures de teste.

Os testes usam um banco PostgreSQL dedicado. Por segurança, o nome do banco
precisa terminar em `_test`: nunca apagamos dados de desenvolvimento ou produção.
"""

import os
import secrets

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://irrigavale:irrigavale@localhost:5432/irrigavale_test",
)
if not TEST_DATABASE_URL.split("?")[0].rstrip("/").endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL precisa apontar para um banco que termine em _test.")

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["APP_ENV"] = "test"
os.environ["SMS_PROVIDER"] = "log"
os.environ["WEATHER_ENABLED"] = "false"
os.environ["JWT_SECRET"] = "chave-de-teste-com-mais-de-32-bytes-0123456789"

# Senha dos usuários efêmeros de teste: gerada a cada execução, nunca fixa no código.
TEST_PASSWORD = os.environ.get("TEST_USER_PASSWORD") or secrets.token_urlsafe(16)

from dataclasses import dataclass, field  # noqa: E402
from datetime import time  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import models as _models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables():
    async with engine.begin() as conn:
        names = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
        await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@dataclass
class Session:
    client: AsyncClient
    headers: dict[str, str]
    farm: dict = field(default_factory=dict)


async def register(client: AsyncClient, email: str, farm_name: str = "Fazenda Teste") -> Session:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "João Silva",
            "farm_name": farm_name,
            "email": email,
            "password": TEST_PASSWORD,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    return Session(client=client, headers=headers, farm=body["user"]["farm"])


@pytest.fixture
async def farmer(client: AsyncClient) -> Session:
    return await register(client, "joao@fazendateste.com.br")


async def create_zone(s: Session, **overrides) -> dict:
    payload = {
        "name": "Zona A",
        "crop": "Manga Tommy",
        "area_ha": 2.0,
        "dry_threshold": 30,
        "wet_threshold": 70,
        "management": "normal",
    }
    payload.update(overrides)
    response = await s.client.post("/api/v1/zones", json=payload, headers=s.headers)
    assert response.status_code == 201, response.text
    return response.json()


async def create_device(s: Session, zone_id: str | None, code: str = "ESP32-0001") -> dict:
    response = await s.client.post(
        "/api/v1/devices",
        json={"code": code, "name": "Sensor", "zone_id": zone_id},
        headers=s.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def send_reading(s: Session, api_key: str, **payload) -> dict:
    body = {"moisture_pct": 50.0, "temperature_c": 30.0, "battery_pct": 90}
    body.update(payload)
    response = await s.client.post(
        "/api/v1/ingest/readings", json=body, headers={"X-Device-Key": api_key}
    )
    assert response.status_code == 202, response.text
    return response.json()


WINDOW = time(5, 0)
