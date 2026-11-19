from tests.conftest import TEST_PASSWORD, register


async def test_register_creates_farm_and_returns_token(client):
    s = await register(client, "maria@fazendateste.com.br", farm_name="Sítio Boa Vista")
    assert s.farm["name"] == "Sítio Boa Vista"
    assert s.farm["timezone"] == "America/Recife"
    assert "access_token" not in s.farm


async def test_duplicate_email_is_rejected(client):
    await register(client, "dup@fazendateste.com.br")
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Outro",
            "farm_name": "Outra",
            "email": "DUP@fazendateste.com.br",
            "password": TEST_PASSWORD,
        },
    )
    assert response.status_code == 409


async def test_weak_password_is_rejected(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Ana",
            "farm_name": "Fazenda",
            "email": "ana@xteste.com.br",
            "password": "123",
        },
    )
    assert response.status_code == 422


async def test_login_with_wrong_password_returns_401(client):
    await register(client, "login@fazendateste.com.br")
    response = await client.post(
        "/api/v1/auth/login", json={"email": "login@fazendateste.com.br", "password": "errada-123"}
    )
    assert response.status_code == 401


async def test_protected_route_requires_token(client):
    assert (await client.get("/api/v1/dashboard")).status_code == 401
    assert (
        await client.get("/api/v1/zones", headers={"Authorization": "Bearer lixo"})
    ).status_code == 401


async def test_me_returns_current_user(farmer):
    response = await farmer.client.get("/api/v1/auth/me", headers=farmer.headers)
    assert response.status_code == 200
    assert response.json()["email"] == "joao@fazendateste.com.br"
