from fastapi import APIRouter

from app.api.deps import CurrentFarm, DbSession
from app.schemas import WeatherOut
from app.services.weather import get_weather

router = APIRouter(tags=["weather"])


@router.get("/weather", response_model=WeatherOut | None)
async def weather(farm: CurrentFarm, session: DbSession) -> WeatherOut | None:
    """Clima atual (Open-Meteo). Devolve null quando indisponível."""
    return await get_weather(session, farm)
