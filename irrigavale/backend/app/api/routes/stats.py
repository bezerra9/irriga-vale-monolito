from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentFarm, DbSession
from app.schemas import SummaryOut
from app.services.stats import Period, build_summary

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/summary", response_model=SummaryOut)
async def summary(
    farm: CurrentFarm, session: DbSession, period: Annotated[Period, Query()] = "month"
) -> SummaryOut:
    return await build_summary(session, farm, period)
