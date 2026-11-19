from fastapi import APIRouter

from app.api.routes import (
    alerts,
    auth,
    dashboard,
    devices,
    farm,
    ingest,
    irrigations,
    routines,
    stats,
    weather,
    zones,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(farm.router)
api_router.include_router(zones.router)
api_router.include_router(devices.router)
api_router.include_router(ingest.router)
api_router.include_router(dashboard.router)
api_router.include_router(irrigations.router)
api_router.include_router(routines.router)
api_router.include_router(alerts.router)
api_router.include_router(weather.router)
api_router.include_router(stats.router)
