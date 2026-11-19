import uuid
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthError, NotFoundError
from app.core.security import decode_access_token, hash_device_key
from app.db.session import get_session
from app.models import Device, Farm, User

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("Faça login para continuar.")
    user_id: uuid.UUID = decode_access_token(credentials.credentials)
    user = await session.get(User, user_id)
    if user is None:
        raise AuthError("Sessão inválida. Entre novamente.")
    return user


async def get_current_farm(
    session: DbSession, user: Annotated[User, Depends(get_current_user)]
) -> Farm:
    farm = await session.get(Farm, user.farm_id)
    if farm is None:  # pragma: no cover - integridade garantida pela FK
        raise NotFoundError("Fazenda não encontrada.")
    return farm


async def get_device_by_key(
    session: DbSession,
    x_device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> Device:
    if not x_device_key:
        raise AuthError("Cabeçalho X-Device-Key ausente.")
    device = (
        await session.execute(
            select(Device).where(
                Device.key_hash == hash_device_key(x_device_key),
                Device.revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if device is None:
        raise AuthError("Chave de sensor inválida ou revogada.")
    return device


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentFarm = Annotated[Farm, Depends(get_current_farm)]
CurrentDevice = Annotated[Device, Depends(get_device_by_key)]
