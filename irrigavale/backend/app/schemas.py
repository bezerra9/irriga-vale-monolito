"""Contratos da API (entrada e saída). Separados dos modelos ORM de propósito."""

import uuid
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import AlertKind, IrrigationOrigin, IrrigationStatus, ZoneManagement

PHONE_PATTERN = r"^\+[1-9]\d{7,14}$"
DEVICE_CODE_PATTERN = r"^[A-Z0-9][A-Z0-9-]{2,31}$"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    farm_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72, description="Limite do bcrypt: 72 bytes")
    city: str = Field(default="Petrolina", max_length=120)
    state: str = Field(default="PE", min_length=2, max_length=2)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class FarmOut(ORMModel):
    id: uuid.UUID
    name: str
    city: str
    state: str
    timezone: str
    daily_water_goal_l: int
    sms_enabled: bool
    sms_phone: str | None
    app_notifications_enabled: bool
    auto_approve: bool
    quiet_hours_start: time
    quiet_hours_end: time
    irrigation_window_start: time
    water_price_brl_per_m3: float
    reading_interval_min: int


class UserOut(ORMModel):
    id: uuid.UUID
    name: str
    email: str
    farm: FarmOut


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


# ---------- Farm ----------
class FarmUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    daily_water_goal_l: int | None = Field(default=None, ge=0, le=10_000_000)
    sms_enabled: bool | None = None
    sms_phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    app_notifications_enabled: bool | None = None
    auto_approve: bool | None = None
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    irrigation_window_start: time | None = None
    water_price_brl_per_m3: float | None = Field(default=None, ge=0, le=1000)
    reading_interval_min: Literal[5, 10, 15, 30, 60] | None = None


# ---------- Zones ----------
class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    crop: str = Field(min_length=1, max_length=80)
    area_ha: float = Field(ge=0, le=100_000)
    dry_threshold: int = Field(default=30, ge=0, le=100)
    wet_threshold: int = Field(default=70, ge=0, le=100)
    management: ZoneManagement = ZoneManagement.normal

    @model_validator(mode="after")
    def _thresholds_ordered(self) -> "ZoneIn":
        if self.dry_threshold >= self.wet_threshold:
            raise ValueError("O limiar de solo seco deve ser menor que o de solo úmido.")
        return self


class ZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    crop: str | None = Field(default=None, min_length=1, max_length=80)
    area_ha: float | None = Field(default=None, ge=0, le=100_000)
    dry_threshold: int | None = Field(default=None, ge=0, le=100)
    wet_threshold: int | None = Field(default=None, ge=0, le=100)
    management: ZoneManagement | None = None


class ZoneOut(ORMModel):
    id: uuid.UUID
    name: str
    crop: str
    area_ha: float
    dry_threshold: int
    wet_threshold: int
    management: ZoneManagement
    status: str
    last_moisture_pct: float | None
    last_temperature_c: float | None
    last_reading_at: datetime | None


class ReadingOut(ORMModel):
    recorded_at: datetime
    moisture_pct: float
    temperature_c: float | None


# ---------- Devices ----------
class DeviceIn(BaseModel):
    code: str = Field(pattern=DEVICE_CODE_PATTERN, description="Código impresso na etiqueta")
    name: str = Field(min_length=1, max_length=80)
    zone_id: uuid.UUID | None = None


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    zone_id: uuid.UUID | None = None


class DeviceOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    zone_id: uuid.UUID | None
    battery_pct: int | None
    signal_dbm: int | None
    last_seen_at: datetime | None
    connection: Literal["never", "online", "offline"]
    created_at: datetime


class DeviceCreatedOut(DeviceOut):
    # A chave aparece somente nesta resposta. Depois disso só é possível rotacioná-la.
    api_key: str


# ---------- Ingest (ESP32 / Arduino) ----------
class ReadingIn(BaseModel):
    moisture_pct: float = Field(ge=0, le=100)
    temperature_c: float | None = Field(default=None, ge=-20, le=70)
    battery_pct: int | None = Field(default=None, ge=0, le=100)
    signal_dbm: int | None = Field(default=None, ge=-130, le=0)
    recorded_at: datetime | None = None

    @field_validator("recorded_at")
    @classmethod
    def _require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("recorded_at precisa de fuso horário (ex.: 2026-11-12T10:00:00Z).")
        return value


class IngestOut(BaseModel):
    accepted: bool = True
    zone_status: str | None
    irrigation_recommended: bool
    next_reading_in_s: int = 600


# ---------- Irrigations ----------
class IrrigationOut(BaseModel):
    id: uuid.UUID
    zone_id: uuid.UUID
    zone_name: str
    routine_id: uuid.UUID | None
    origin: IrrigationOrigin
    status: IrrigationStatus
    scheduled_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_min: int
    volume_l_estimated: int | None
    volume_l_actual: int | None
    reason: str | None


class ManualIrrigationIn(BaseModel):
    zone_id: uuid.UUID
    duration_min: int = Field(default=45, ge=5, le=480)
    started_at: datetime | None = None


class FinishIn(BaseModel):
    volume_l: int | None = Field(default=None, ge=0, le=5_000_000)


# ---------- Routines ----------
class RoutineIn(BaseModel):
    zone_id: uuid.UUID
    weekdays: list[int] = Field(min_length=1, max_length=7, description="0=segunda ... 6=domingo")
    start_time: time
    duration_min: int = Field(default=45, ge=5, le=480)
    respect_sensor: bool = True
    moisture_limit: int = Field(default=40, ge=0, le=100)
    active: bool = True

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, value: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in value) or len(set(value)) != len(value):
            raise ValueError("weekdays deve conter dias únicos entre 0 e 6.")
        return sorted(value)


class RoutineUpdate(BaseModel):
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    start_time: time | None = None
    duration_min: int | None = Field(default=None, ge=5, le=480)
    respect_sensor: bool | None = None
    moisture_limit: int | None = Field(default=None, ge=0, le=100)
    active: bool | None = None

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        if any(d < 0 or d > 6 for d in value) or len(set(value)) != len(value):
            raise ValueError("weekdays deve conter dias únicos entre 0 e 6.")
        return sorted(value)


class RoutineOut(BaseModel):
    id: uuid.UUID
    zone_id: uuid.UUID
    zone_name: str
    weekdays: list[int]
    start_time: time
    duration_min: int
    respect_sensor: bool
    moisture_limit: int
    active: bool


# ---------- Alerts ----------
class AlertOut(BaseModel):
    id: uuid.UUID
    zone_id: uuid.UUID | None
    zone_name: str | None
    kind: AlertKind
    message: str
    sms_sent: bool
    created_at: datetime
    read_at: datetime | None


# ---------- Dashboard ----------
class DashboardOut(BaseModel):
    farm_name: str
    user_name: str
    zones: list[ZoneOut]
    water_used_today_l: int
    water_goal_l: int
    active_irrigations: list[IrrigationOut]
    unread_alerts: int


# ---------- Clima ----------
class WeatherOut(BaseModel):
    temperature_c: float
    humidity_pct: int
    wind_kmh: float
    uv_index: float
    precipitation_mm: float
    condition: str
    icon: Literal["sunny", "partly", "cloudy", "fog", "rain", "storm", "night"]
    updated_at: datetime


# ---------- Estatísticas ----------
class SummaryOut(BaseModel):
    period: Literal["today", "month"]
    period_start: datetime
    water_used_l: int
    irrigations_done: int
    irrigations_skipped: int
    water_saved_l: int
    savings_brl: float
