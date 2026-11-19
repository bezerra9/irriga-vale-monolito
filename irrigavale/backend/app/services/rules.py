"""Regras agronômicas puras. Sem I/O, para serem testadas diretamente."""

from app.models import ZoneManagement

ATTENTION_MARGIN = 10  # pontos acima do limiar seco em que a zona fica em atenção
TARGET_MARGIN = 5  # pontos abaixo do limiar úmido em que a irrigação já atingiu a meta
LOW_BATTERY_PCT = 20
# Estimativa simplificada por hora de irrigação. Calibrar por cultura e sistema.
ESTIMATED_LITERS_PER_HA = 1500


def needs_irrigation(moisture: float, dry_threshold: int, management: ZoneManagement) -> bool:
    """Solo abaixo do limiar seco. Zonas em déficit controlado nunca geram recomendação."""
    return management == ZoneManagement.normal and moisture < dry_threshold


def is_warning(moisture: float, dry_threshold: int, management: ZoneManagement) -> bool:
    return (
        management == ZoneManagement.normal
        and dry_threshold <= moisture < dry_threshold + ATTENTION_MARGIN
    )


def target_reached(moisture: float, wet_threshold: int) -> bool:
    return moisture >= wet_threshold - TARGET_MARGIN


def is_low_battery(battery_pct: int | None) -> bool:
    return battery_pct is not None and battery_pct <= LOW_BATTERY_PCT


def estimate_volume_l(area_ha: float, duration_min: int) -> int:
    return round(area_ha * ESTIMATED_LITERS_PER_HA * duration_min / 60)


def water_savings(
    skipped_estimated_l: list[int | None],
    done_volumes_l: list[tuple[int | None, int | None]],
    price_brl_per_m3: float,
) -> tuple[int, float]:
    """Água economizada em relação ao "método manual" e o valor em reais.

    O método manual é irrigar sempre o volume programado, sem olhar o sensor. Então a
    economia é a soma de:
    - o volume estimado das irrigações puladas porque o solo já estava úmido; e
    - nas irrigações concluídas, o quanto o volume real ficou abaixo do estimado
      (nunca negativo: gastar mais que o previsto não conta como "economia negativa").

    `done_volumes_l` traz pares (estimado, real). Valores ausentes contam como zero.
    Retorna (litros economizados, reais economizados com 2 casas).
    """
    saved = sum(v or 0 for v in skipped_estimated_l)
    for estimated, actual in done_volumes_l:
        if estimated is not None and actual is not None:
            saved += max(0, estimated - actual)
    return saved, round(saved / 1000 * price_brl_per_m3, 2)
