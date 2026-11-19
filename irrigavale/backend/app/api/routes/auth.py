from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentFarm, CurrentUser, DbSession
from app.core.errors import AuthError, ConflictError
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Farm, User
from app.schemas import FarmOut, LoginIn, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User, farm: Farm) -> UserOut:
    return UserOut(id=user.id, name=user.name, email=user.email, farm=FarmOut.model_validate(farm))


@router.post("/register", status_code=201, response_model=TokenOut)
async def register(payload: RegisterIn, session: DbSession) -> TokenOut:
    email = str(payload.email).lower()
    exists = await session.scalar(select(User.id).where(User.email == email))
    if exists is not None:
        raise ConflictError("Já existe uma conta com este e-mail.")

    farm = Farm(name=payload.farm_name, city=payload.city, state=payload.state.upper())
    session.add(farm)
    await session.flush()
    user = User(
        farm_id=farm.id,
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    await session.commit()
    return TokenOut(access_token=create_access_token(user.id), user=_user_out(user, farm))


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, session: DbSession) -> TokenOut:
    user = await session.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthError("E-mail ou senha incorretos.")
    farm = await session.get(Farm, user.farm_id)
    assert farm is not None
    return TokenOut(access_token=create_access_token(user.id), user=_user_out(user, farm))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, farm: CurrentFarm) -> UserOut:
    return _user_out(user, farm)
