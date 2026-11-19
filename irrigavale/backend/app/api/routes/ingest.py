from fastapi import APIRouter

from app.api.deps import CurrentDevice, DbSession
from app.schemas import IngestOut, ReadingIn
from app.services.ingest import ingest_reading

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/readings", response_model=IngestOut, status_code=202)
async def post_reading(payload: ReadingIn, device: CurrentDevice, session: DbSession) -> IngestOut:
    """Endpoint usado pelos sensores ESP32/Arduino. Autenticação pelo cabeçalho X-Device-Key."""
    return await ingest_reading(session, device, payload)
