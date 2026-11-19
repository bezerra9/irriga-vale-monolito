"""Modelos ORM do IrrigaVale.

Convenções:
- UUID como chave primária (exceto a série temporal de leituras).
- Datas em UTC com timezone (`timestamptz`).
- Sem `relationship()`: as consultas são explícitas, o que evita carregamento
  preguiçoso (lazy loading) em código assíncrono.
"""

import enum
import uuid
from datetime import datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class ZoneManagement(enum.StrEnum):
    normal = "normal"
    # Fase de manejo com déficit hídrico controlado (ex.: indução de floração na manga).
    planned_stress = "planned_stress"


class IrrigationOrigin(enum.StrEnum):
    system = "system"
    routine = "routine"
    manual = "manual"


class IrrigationStatus(enum.StrEnum):
    recommended = "recommended"  # sugerida pelo sistema, aguarda aprovação
    approved = "approved"  # aprovada / programada, aguarda início
    postponed = "postponed"  # adiada para a próxima janela
    in_progress = "in_progress"  # em andamento (registrada pelo produtor)
    done = "done"  # concluída, com volume registrado
    skipped = "skipped"  # rotina pulada pelo sensor (solo já úmido)
    cancelled = "cancelled"


class AlertKind(enum.StrEnum):
    critical = "critical"
    warning = "warning"
    done = "done"
    info = "info"
    device = "device"


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120), default="Petrolina")
    state: Mapped[str] = mapped_column(String(2), default="PE")
    timezone: Mapped[str] = mapped_column(String(64), default="America/Recife")
    daily_water_goal_l: Mapped[int] = mapped_column(Integer, default=8000)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    sms_phone: Mapped[str | None] = mapped_column(String(20))
    app_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_hours_start: Mapped[time] = mapped_column(Time, default=time(22, 0))
    quiet_hours_end: Mapped[time] = mapped_column(Time, default=time(5, 0))
    irrigation_window_start: Mapped[time] = mapped_column(Time, default=time(5, 0))
    # Tarifa usada para converter a água economizada em reais.
    water_price_brl_per_m3: Mapped[float] = mapped_column(Float, default=5.0, server_default="5")
    # Intervalo de leitura devolvido ao sensor na resposta da ingestão.
    reading_interval_min: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    # Cache da geocodificação da cidade (clima). Zerado quando a cidade muda.
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    crop: Mapped[str] = mapped_column(String(80))
    area_ha: Mapped[float] = mapped_column(Float, default=0.0)
    dry_threshold: Mapped[int] = mapped_column(Integer, default=30)
    wet_threshold: Mapped[int] = mapped_column(Integer, default=70)
    management: Mapped[ZoneManagement] = mapped_column(
        _enum(ZoneManagement, "zone_management"), default=ZoneManagement.normal
    )
    # Último estado conhecido, desnormalizado para o painel não precisar de JOIN.
    last_moisture_pct: Mapped[float | None] = mapped_column(Float)
    last_temperature_c: Mapped[float | None] = mapped_column(Float)
    last_reading_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    archived_at: Mapped[datetime | None]


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("zones.id", ondelete="SET NULL"), index=True
    )
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    battery_pct: Mapped[int | None] = mapped_column(Integer)
    signal_dbm: Mapped[int | None] = mapped_column(Integer)
    last_seen_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked_at: Mapped[datetime | None]


class Reading(Base):
    """Série temporal das leituras dos sensores."""

    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_zone_time", "zone_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="CASCADE"), index=True
    )
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("zones.id", ondelete="SET NULL")
    )
    moisture_pct: Mapped[float] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    battery_pct: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[datetime]
    received_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("zones.id", ondelete="CASCADE"), index=True
    )
    # Bitmask: bit 0 = segunda (weekday 0) ... bit 6 = domingo.
    weekdays: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[time] = mapped_column(Time)
    duration_min: Mapped[int] = mapped_column(Integer, default=45)
    respect_sensor: Mapped[bool] = mapped_column(Boolean, default=True)
    moisture_limit: Mapped[int] = mapped_column(Integer, default=40)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Irrigation(Base):
    __tablename__ = "irrigations"
    __table_args__ = (
        UniqueConstraint("routine_id", "scheduled_at", name="uq_irrigation_routine_slot"),
        Index("ix_irrigations_zone_status", "zone_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("zones.id", ondelete="CASCADE"))
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("routines.id", ondelete="SET NULL")
    )
    origin: Mapped[IrrigationOrigin] = mapped_column(_enum(IrrigationOrigin, "irrigation_origin"))
    status: Mapped[IrrigationStatus] = mapped_column(
        _enum(IrrigationStatus, "irrigation_status"), default=IrrigationStatus.recommended
    )
    scheduled_at: Mapped[datetime]
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]
    duration_min: Mapped[int] = mapped_column(Integer, default=45)
    volume_l_estimated: Mapped[int | None] = mapped_column(Integer)
    volume_l_actual: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_farm_created", "farm_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("farms.id", ondelete="CASCADE"))
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("zones.id", ondelete="SET NULL")
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="SET NULL")
    )
    kind: Mapped[AlertKind] = mapped_column(_enum(AlertKind, "alert_kind"))
    message: Mapped[str] = mapped_column(Text)
    sms_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    read_at: Mapped[datetime | None]
    dismissed_at: Mapped[datetime | None]
