from fastapi import APIRouter

from app.api.deps import CurrentFarm, DbSession
from app.core.errors import ValidationRuleError
from app.schemas import FarmOut, FarmUpdate

router = APIRouter(prefix="/farm", tags=["farm"])


@router.get("", response_model=FarmOut)
async def get_farm(farm: CurrentFarm) -> FarmOut:
    return FarmOut.model_validate(farm)


@router.patch("", response_model=FarmOut)
async def update_farm(payload: FarmUpdate, farm: CurrentFarm, session: DbSession) -> FarmOut:
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        # Só o celular aceita null (desativa o número); nos demais, null é ignorado.
        if value is None and field != "sms_phone":
            continue
        if field == "city" and value != farm.city:
            farm.latitude = None  # força nova geocodificação para o clima
            farm.longitude = None
        setattr(farm, field, value)
    if farm.sms_enabled and not farm.sms_phone:
        raise ValidationRuleError(
            "Informe um celular com DDI (ex.: +5587999998888) para ativar SMS."
        )
    await session.commit()
    await session.refresh(farm)
    return FarmOut.model_validate(farm)
