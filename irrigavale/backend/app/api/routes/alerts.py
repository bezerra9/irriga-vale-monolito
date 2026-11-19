from datetime import datetime

from fastapi import APIRouter, Response
from sqlalchemy import select, update

from app.api.deps import CurrentFarm, DbSession
from app.models import Alert, Zone
from app.schemas import AlertOut
from app.services.mappers import alert_out
from app.services.time_utils import utcnow

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    farm: CurrentFarm, session: DbSession, unread_only: bool = False, limit: int = 50
) -> list[AlertOut]:
    query = (
        select(Alert, Zone.name)
        .outerjoin(Zone, Zone.id == Alert.zone_id)
        .where(Alert.farm_id == farm.id, Alert.dismissed_at.is_(None))
        .order_by(Alert.created_at.desc())
        .limit(min(max(limit, 1), 200))
    )
    if unread_only:
        query = query.where(Alert.read_at.is_(None))
    rows = (await session.execute(query)).all()
    return [alert_out(a, name) for a, name in rows]


@router.post("/read-all", status_code=204)
async def read_all(farm: CurrentFarm, session: DbSession) -> Response:
    await session.execute(
        update(Alert)
        .where(Alert.farm_id == farm.id, Alert.read_at.is_(None))
        .values(read_at=utcnow())
    )
    await session.commit()
    return Response(status_code=204)


@router.post("/clear", status_code=204)
async def clear(farm: CurrentFarm, session: DbSession) -> Response:
    """Oculta o histórico da tela. Os registros continuam no banco para auditoria."""
    now: datetime = utcnow()
    await session.execute(
        update(Alert)
        .where(Alert.farm_id == farm.id, Alert.dismissed_at.is_(None))
        .values(dismissed_at=now, read_at=now)
    )
    await session.commit()
    return Response(status_code=204)
