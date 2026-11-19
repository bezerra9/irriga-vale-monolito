"""Ciclo de vida das irrigações.

Fluxo (sem acionamento automático de bomba nesta versão):
  recommended/approved/postponed --start--> in_progress --finish--> done
  recommended -> approved (approve) | postponed (postpone) | cancelled (cancel)
O produtor liga/desliga a irrigação manualmente e registra início e volume no app.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models import (
    AlertKind,
    Farm,
    Irrigation,
    IrrigationOrigin,
    IrrigationStatus,
    Zone,
)
from app.services.alerts import create_alert
from app.services.rules import estimate_volume_l
from app.services.time_utils import next_window, utcnow

S = IrrigationStatus
OPEN_STATUSES = (S.recommended, S.approved, S.postponed, S.in_progress)
POSTPONE_HOURS = 12

# action -> (estados de origem permitidos, estado de destino)
TRANSITIONS: dict[str, tuple[frozenset[IrrigationStatus], IrrigationStatus]] = {
    "approve": (frozenset({S.recommended, S.postponed}), S.approved),
    "postpone": (frozenset({S.recommended, S.approved}), S.postponed),
    "start": (frozenset({S.recommended, S.approved, S.postponed}), S.in_progress),
    "finish": (frozenset({S.in_progress}), S.done),
    "cancel": (frozenset({S.recommended, S.approved, S.postponed}), S.cancelled),
}

STATUS_LABEL = {
    S.recommended: "recomendada",
    S.approved: "aprovada",
    S.postponed: "adiada",
    S.in_progress: "em andamento",
    S.done: "concluída",
    S.skipped: "pulada",
    S.cancelled: "cancelada",
}


def elapsed_minutes(irrigation: Irrigation, now: datetime) -> int:
    """Minutos entre o início e agora (mínimo 1). Sem início registrado, usa a duração prevista."""
    if irrigation.started_at is None:
        return irrigation.duration_min
    return max(1, round((now - irrigation.started_at).total_seconds() / 60))


def format_liters(volume: int | None) -> str:
    if volume is None:
        return "volume não informado"
    return f"{volume:,}".replace(",", ".") + " L"


async def open_irrigation_for_zone(session: AsyncSession, zone_id) -> Irrigation | None:
    """Irrigação aberta da zona. Prioriza a que está em andamento."""
    rows = (
        (
            await session.execute(
                select(Irrigation)
                .where(Irrigation.zone_id == zone_id, Irrigation.status.in_(OPEN_STATUSES))
                .order_by(Irrigation.scheduled_at)
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return None
    in_progress = [r for r in rows if r.status == S.in_progress]
    return in_progress[0] if in_progress else rows[0]


async def get_farm_irrigation(session: AsyncSession, farm: Farm, irrigation_id) -> Irrigation:
    row = (
        await session.execute(
            select(Irrigation)
            .join(Zone, Zone.id == Irrigation.zone_id)
            .where(Irrigation.id == irrigation_id, Zone.farm_id == farm.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Irrigação não encontrada.")
    return row


async def _ensure_no_other_in_progress(session: AsyncSession, zone_id, exclude_id=None) -> None:
    query = select(Irrigation.id).where(
        Irrigation.zone_id == zone_id, Irrigation.status == S.in_progress
    )
    if exclude_id is not None:
        query = query.where(Irrigation.id != exclude_id)
    if (await session.execute(query.limit(1))).first() is not None:
        raise ConflictError("Já existe uma irrigação em andamento nesta zona.")


async def apply_action(
    session: AsyncSession,
    farm: Farm,
    irrigation: Irrigation,
    action: str,
    *,
    volume_l: int | None = None,
    started_at: datetime | None = None,
    now: datetime | None = None,
) -> Irrigation:
    now = now or utcnow()
    allowed, target = TRANSITIONS[action]
    if irrigation.status not in allowed:
        raise ConflictError(
            f"Não é possível aplicar '{action}' em uma irrigação {STATUS_LABEL[irrigation.status]}."
        )

    if action == "start":
        await _ensure_no_other_in_progress(session, irrigation.zone_id, irrigation.id)
        irrigation.started_at = started_at or now

    elif action == "postpone":
        # Empurra para a janela seguinte à atual, nunca para um horário já passado ou igual.
        base = max(irrigation.scheduled_at, now)
        irrigation.scheduled_at = next_window(
            farm.timezone,
            farm.irrigation_window_start,
            base + timedelta(hours=POSTPONE_HOURS),
        )

    elif action == "finish":
        irrigation.finished_at = now
        zone = await session.get(Zone, irrigation.zone_id)
        assert zone is not None
        if volume_l is None:
            # Sem hidrômetro: estima pelo tempo que a irrigação realmente durou.
            volume_l = estimate_volume_l(zone.area_ha, elapsed_minutes(irrigation, now))
            volume_text = f": {format_liters(volume_l)} (estimado)."
        else:
            volume_text = f": {format_liters(volume_l)}."
        irrigation.volume_l_actual = volume_l
        await create_alert(
            session,
            farm,
            AlertKind.done,
            f"Irrigação concluída em {zone.name}{volume_text}",
            zone_id=zone.id,
            now=now,
        )

    irrigation.status = target
    await session.commit()
    await session.refresh(irrigation)
    return irrigation


async def start_manual_irrigation(
    session: AsyncSession,
    farm: Farm,
    zone: Zone,
    *,
    duration_min: int,
    started_at: datetime | None,
) -> Irrigation:
    """Registra uma irrigação iniciada pelo produtor sem recomendação prévia."""
    now = utcnow()
    start = started_at or now
    if start > now + timedelta(minutes=5):
        raise ConflictError("O horário de início não pode estar no futuro.")
    await _ensure_no_other_in_progress(session, zone.id)
    irrigation = Irrigation(
        zone_id=zone.id,
        origin=IrrigationOrigin.manual,
        status=S.in_progress,
        scheduled_at=start,
        started_at=start,
        duration_min=duration_min,
        volume_l_estimated=estimate_volume_l(zone.area_ha, duration_min),
        reason="Registrada pelo produtor",
    )
    session.add(irrigation)
    await session.commit()
    await session.refresh(irrigation)
    return irrigation
