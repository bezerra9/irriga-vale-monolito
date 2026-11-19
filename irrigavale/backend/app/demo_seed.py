"""Cria um usuário de demonstração com dados falsos cobrindo todas as telas do app.

Uso (dentro do container da API ou com o venv do backend ativo):

    python -m app.demo_seed            # cria/recria o usuário demo
    python -m app.demo_seed --live     # idem, e segue enviando leituras a cada 5 min

Login no app:  demo@irrigavale.com.br / demo1234

O script é idempotente: se o usuário demo já existir, a fazenda dele é apagada
(cascade) e recriada do zero. Recusa rodar com APP_ENV=production.

Sem `--live`, os sensores ficam "offline" depois de OFFLINE_AFTER_MINUTES (padrão 30),
porque ninguém mais envia leituras. O modo `--live` simula os sensores usando o mesmo
serviço de ingestão do endpoint real, então alertas e recomendações também são gerados.
"""

import argparse
import asyncio
import contextlib
import math
import random
from dataclasses import dataclass
from datetime import datetime, time, timedelta

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.security import generate_device_key, hash_device_key, hash_password
from app.db.session import SessionLocal, engine
from app.models import (
    Alert,
    AlertKind,
    Device,
    Farm,
    Irrigation,
    IrrigationOrigin,
    IrrigationStatus,
    Reading,
    Routine,
    User,
    Zone,
    ZoneManagement,
)
from app.schemas import ReadingIn
from app.services import rules
from app.services.ingest import ingest_reading
from app.services.time_utils import local_datetime_to_utc, local_now, next_window, utcnow

DEMO_EMAIL = "demo@irrigavale.com.br"
DEMO_PASSWORD = "demo1234"
HISTORY_DAYS = 7
READING_STEP = timedelta(minutes=30)
LIVE_INTERVAL = timedelta(minutes=5)

MON, TUE, WED, THU, FRI, SAT, SUN = (1 << i for i in range(7))


@dataclass
class ZoneSpec:
    name: str
    crop: str
    area_ha: float
    dry: int
    wet: int
    current: float  # umidade atual: define o status da zona no painel
    management: ZoneManagement = ZoneManagement.normal
    device_code: str = ""
    battery: int = 85
    signal: int = -67
    offline_hours: float = 0  # > 0 deixa o sensor/zona offline


ZONES = [
    ZoneSpec("Talhão 1", "Manga Palmer", 4.0, 30, 70, 52, device_code="DEMO-001"),
    ZoneSpec("Talhão 2", "Uva Vitória", 2.5, 35, 75, 24, device_code="DEMO-002"),
    ZoneSpec("Talhão 3", "Acerola", 1.5, 30, 70, 35, device_code="DEMO-003",
             battery=14, signal=-88),
    ZoneSpec("Talhão 4", "Coco Anão", 3.0, 35, 70, 74, device_code="DEMO-004"),
    ZoneSpec("Talhão 5", "Manga Tommy", 5.0, 30, 70, 21,
             management=ZoneManagement.planned_stress, device_code="DEMO-005"),
    ZoneSpec("Talhão 6", "Goiaba", 1.0, 30, 70, 48, device_code="DEMO-006",
             battery=41, signal=-95, offline_hours=3),
]


def _moisture_curve(spec: ZoneSpec, hours_ago: float) -> float:
    """Ciclo dente-de-serra: seca ao longo do dia, sobe após irrigação nas manhãs."""
    cycle = 24.0
    phase = (hours_ago % cycle) / cycle  # 0 = agora, 1 = 24 h atrás
    swing = 18 if spec.management == ZoneManagement.normal else 6
    value = spec.current + swing * phase - 2 * math.sin(hours_ago / 3)
    return round(max(5.0, min(95.0, value + random.uniform(-1.2, 1.2))), 1)


def _temperature(at: datetime) -> float:
    # Pico por volta das 15h locais (UTC-3 ⇒ 18h UTC).
    hour = at.hour + at.minute / 60
    return round(29 + 6 * math.sin((hour - 12) / 24 * 2 * math.pi) + random.uniform(-0.8, 0.8), 1)


async def _remove_existing(session) -> None:
    farm_id = await session.scalar(select(User.farm_id).where(User.email == DEMO_EMAIL))
    if farm_id is not None:
        # Leituras referenciam devices (cascade) e zones (set null); a fazenda leva o resto.
        devices = select(Device.id).where(Device.farm_id == farm_id)
        await session.execute(delete(Reading).where(Reading.device_id.in_(devices)))
        await session.execute(delete(Farm).where(Farm.id == farm_id))
        await session.flush()


async def seed() -> dict[str, str]:
    random.seed(42)
    now = utcnow()
    keys: dict[str, str] = {}

    async with SessionLocal() as session:
        await _remove_existing(session)

        farm = Farm(
            name="Fazenda Boa Esperança (demo)",
            city="Petrolina",
            state="PE",
            timezone="America/Recife",
            daily_water_goal_l=12000,
            sms_enabled=True,
            sms_phone="+5587999990000",
            app_notifications_enabled=True,
            auto_approve=False,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(5, 0),
            irrigation_window_start=time(5, 0),
            water_price_brl_per_m3=6.5,
            reading_interval_min=10,
        )
        session.add(farm)
        await session.flush()

        session.add(
            User(
                farm_id=farm.id,
                name="Produtor Demo",
                email=DEMO_EMAIL,
                password_hash=hash_password(DEMO_PASSWORD),
            )
        )

        zones: list[Zone] = []
        devices: dict[str, Device] = {}
        for spec in ZONES:
            last_at = now - timedelta(hours=spec.offline_hours, minutes=random.randint(1, 4))
            zone = Zone(
                farm_id=farm.id,
                name=spec.name,
                crop=spec.crop,
                area_ha=spec.area_ha,
                dry_threshold=spec.dry,
                wet_threshold=spec.wet,
                management=spec.management,
                last_moisture_pct=spec.current,
                last_temperature_c=_temperature(last_at),
                last_reading_at=last_at,
            )
            session.add(zone)
            await session.flush()
            zones.append(zone)

            key = generate_device_key()
            keys[spec.device_code] = key
            device = Device(
                farm_id=farm.id,
                zone_id=zone.id,
                code=spec.device_code,
                name=f"Sensor {spec.crop}",
                key_hash=hash_device_key(key),
                battery_pct=spec.battery,
                signal_dbm=spec.signal,
                last_seen_at=last_at,
            )
            session.add(device)
            await session.flush()
            devices[spec.device_code] = device

            # Histórico de leituras (a tela de gráfico aceita até 168 h).
            at = last_at
            while at > now - timedelta(days=HISTORY_DAYS):
                hours_ago = (last_at - at).total_seconds() / 3600
                session.add(
                    Reading(
                        device_id=device.id,
                        zone_id=zone.id,
                        moisture_pct=spec.current if hours_ago == 0 else _moisture_curve(
                            spec, hours_ago
                        ),
                        temperature_c=_temperature(at),
                        battery_pct=min(100, spec.battery + int(hours_ago // 24)),
                        recorded_at=at,
                        received_at=at,
                    )
                )
                at -= READING_STEP

        # Sensor cadastrado mas ainda sem zona e sem leituras.
        spare_key = generate_device_key()
        keys["DEMO-007"] = spare_key
        session.add(
            Device(
                farm_id=farm.id,
                zone_id=None,
                code="DEMO-007",
                name="Sensor reserva",
                key_hash=hash_device_key(spare_key),
            )
        )

        # Zona recém-criada, sem sensor ainda (status "no_data").
        session.add(
            Zone(farm_id=farm.id, name="Talhão 7", crop="Maracujá", area_ha=0.8)
        )

        manga, uva, acerola, coco, _manga_stress, goiaba = zones

        # Rotinas
        routines = [
            Routine(zone_id=manga.id, weekdays=MON | WED | FRI, start_time=time(5, 30),
                    duration_min=60, respect_sensor=True, moisture_limit=45),
            Routine(zone_id=uva.id, weekdays=MON | TUE | WED | THU | FRI | SAT,
                    start_time=time(5, 0), duration_min=40, respect_sensor=True,
                    moisture_limit=50),
            Routine(zone_id=coco.id, weekdays=TUE | THU | SAT, start_time=time(6, 0),
                    duration_min=90, respect_sensor=False, moisture_limit=40),
            Routine(zone_id=goiaba.id, weekdays=SUN, start_time=time(17, 0),
                    duration_min=30, respect_sensor=True, moisture_limit=40, active=False),
        ]
        session.add_all(routines)
        await session.flush()

        # Irrigações concluídas nos últimos dias (histórico + consumo de hoje).
        tz = farm.timezone
        today = local_now(tz, now).date()
        for days_ago in range(HISTORY_DAYS, -1, -1):
            day = today - timedelta(days=days_ago)
            for zone, routine, start, dur in (
                (manga, routines[0], time(5, 30), 60),
                (uva, routines[1], time(5, 0), 40),
                (coco, routines[2], time(6, 0), 90),
            ):
                started = local_datetime_to_utc(tz, day, start)
                finished = started + timedelta(minutes=dur)
                if finished > now:
                    continue
                if zone is coco and days_ago == 0:
                    continue  # a de hoje está em andamento (abaixo)
                est = rules.estimate_volume_l(zone.area_ha, dur)
                skipped = zone is manga and days_ago == 2
                session.add(
                    Irrigation(
                        zone_id=zone.id,
                        routine_id=routine.id,
                        origin=IrrigationOrigin.routine,
                        status=IrrigationStatus.skipped if skipped
                        else IrrigationStatus.done,
                        scheduled_at=started,
                        started_at=None if skipped else started,
                        finished_at=None if skipped else finished,
                        duration_min=dur,
                        volume_l_estimated=est,
                        volume_l_actual=None if skipped
                        else int(est * random.uniform(0.85, 1.1)),
                        reason="Solo já úmido (62%)" if skipped else None,
                    )
                )

        # Uma manual concluída e uma cancelada, para variar o histórico.
        manual_start = now - timedelta(days=3, hours=4)
        session.add_all([
            Irrigation(zone_id=acerola.id, origin=IrrigationOrigin.manual,
                       status=IrrigationStatus.done, scheduled_at=manual_start,
                       started_at=manual_start, finished_at=manual_start + timedelta(minutes=30),
                       duration_min=30, volume_l_estimated=1125, volume_l_actual=1200),
            Irrigation(zone_id=goiaba.id, origin=IrrigationOrigin.system,
                       status=IrrigationStatus.cancelled,
                       scheduled_at=now - timedelta(days=4), duration_min=45,
                       volume_l_estimated=rules.estimate_volume_l(goiaba.area_ha, 45),
                       reason="Umidade em 27% (limiar 30%)"),
        ])

        # Irrigações abertas: aparecem no painel e na tela de irrigação.
        window = next_window(tz, farm.irrigation_window_start, now)
        session.add_all([
            Irrigation(zone_id=uva.id, origin=IrrigationOrigin.system,
                       status=IrrigationStatus.recommended, scheduled_at=window,
                       duration_min=45, volume_l_estimated=rules.estimate_volume_l(2.5, 45),
                       reason="Umidade em 24% (limiar 35%)"),
            Irrigation(zone_id=acerola.id, origin=IrrigationOrigin.manual,
                       status=IrrigationStatus.approved, scheduled_at=window + timedelta(hours=1),
                       duration_min=30, volume_l_estimated=rules.estimate_volume_l(1.5, 30)),
            Irrigation(zone_id=coco.id, routine_id=routines[2].id,
                       origin=IrrigationOrigin.routine, status=IrrigationStatus.in_progress,
                       scheduled_at=now - timedelta(minutes=25),
                       started_at=now - timedelta(minutes=25), duration_min=90,
                       volume_l_estimated=rules.estimate_volume_l(3.0, 90)),
            Irrigation(zone_id=manga.id, origin=IrrigationOrigin.system,
                       status=IrrigationStatus.postponed, scheduled_at=window + timedelta(days=1),
                       duration_min=45, volume_l_estimated=rules.estimate_volume_l(4.0, 45),
                       reason="Adiada pelo produtor"),
        ])

        # Alertas (mistura de lidos e não lidos, de todos os tipos).
        def alert(kind, msg, minutes_ago, zone=None, device=None, read=False, sms=False):
            created = now - timedelta(minutes=minutes_ago)
            return Alert(farm_id=farm.id, zone_id=zone.id if zone else None,
                         device_id=device.id if device else None, kind=kind, message=msg,
                         sms_sent=sms, created_at=created,
                         read_at=created + timedelta(minutes=10) if read else None)

        d = devices
        session.add_all([
            alert(AlertKind.critical, f"{uva.name} com 24% de umidade. Irrigação necessária.",
                  12, uva, sms=True),
            alert(AlertKind.device, "Sensor DEMO-006 sem dados há 180 min.", 150, goiaba,
                  d["DEMO-006"]),
            alert(AlertKind.device, "Bateria baixa no sensor DEMO-003 (14%).", 95, acerola,
                  d["DEMO-003"]),
            alert(AlertKind.warning, f"{acerola.name} abaixo do ideal (35%). Monitore a situação.",
                  60, acerola),
            alert(AlertKind.info, f"{coco.name} atingiu a umidade alvo (74%). "
                  "Você pode encerrar a irrigação.", 5, coco),
            alert(AlertKind.done, f"Irrigação concluída em {manga.name}: 6.120 L.", 60 * 20,
                  manga, read=True),
            alert(AlertKind.done, f"Irrigação concluída em {uva.name}: 2.480 L.", 60 * 21, uva,
                  read=True),
            alert(AlertKind.info, f"Rotina de {manga.name} pulada: solo já úmido (62%).",
                  60 * 50, manga, read=True),
            alert(AlertKind.critical, f"{goiaba.name} com 27% de umidade. Irrigação necessária.",
                  60 * 24 * 4, goiaba, read=True, sms=True),
        ])

        await session.commit()
    return keys


async def live(keys: dict[str, str]) -> None:
    """Envia leituras periódicas pelo mesmo serviço do endpoint de ingestão."""
    print(f"Modo live: enviando leituras a cada {LIVE_INTERVAL.seconds // 60} min. Ctrl+C sai.")
    state = {s.device_code: s.current for s in ZONES if not s.offline_hours}
    while True:
        await asyncio.sleep(LIVE_INTERVAL.total_seconds())
        async with SessionLocal() as session:
            for code, moisture in state.items():
                device = await session.scalar(
                    select(Device).where(Device.key_hash == hash_device_key(keys[code]))
                )
                if device is None:
                    print("Usuário demo foi recriado em outro processo; encerrando.")
                    return
                spec = next(s for s in ZONES if s.device_code == code)
                # Seca devagar; o coco (irrigando) sobe até perto do alvo.
                drift = 0.8 if code == "DEMO-004" else -0.3
                moisture = max(5.0, min(90.0, moisture + drift + random.uniform(-0.5, 0.5)))
                state[code] = moisture
                await ingest_reading(
                    session,
                    device,
                    ReadingIn(moisture_pct=round(moisture, 1),
                              temperature_c=_temperature(utcnow()),
                              battery_pct=spec.battery),
                )
        print(f"{datetime.now():%H:%M} leituras enviadas ({len(state)} sensores)")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--live", action="store_true", help="continua simulando os sensores")
    args = parser.parse_args()

    if get_settings().app_env == "production":
        raise SystemExit("Recusado: APP_ENV=production. O seed demo é só para dev/homologação.")

    try:
        keys = await seed()
        print("Usuário demo criado.")
        print(f"  e-mail: {DEMO_EMAIL}\n  senha:  {DEMO_PASSWORD}\n")
        print("Chaves dos sensores (para testar /api/v1/ingest/readings):")
        for code, key in keys.items():
            print(f"  {code}: {key}")
        if args.live:
            await live(keys)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
