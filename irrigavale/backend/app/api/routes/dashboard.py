from fastapi import APIRouter

from app.api.deps import CurrentFarm, CurrentUser, DbSession
from app.schemas import DashboardOut
from app.services.dashboard import build_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(user: CurrentUser, farm: CurrentFarm, session: DbSession) -> DashboardOut:
    return await build_dashboard(session, user, farm)
