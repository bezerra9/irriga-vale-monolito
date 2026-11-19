from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    """Configuração carregada de variáveis de ambiente (ou do arquivo .env)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "IrrigaVale API"
    app_env: str = "development"
    database_url: str = "postgresql+asyncpg://irrigavale:irrigavale@localhost:5432/irrigavale"

    jwt_secret: str = INSECURE_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=60 * 24, ge=5)

    cors_origins: list[str] = Field(default_factory=list)

    scheduler_enabled: bool = True
    offline_after_minutes: int = Field(default=30, ge=5)
    alert_cooldown_hours: int = Field(default=6, ge=1)
    default_timezone: str = "America/Recife"

    sms_provider: str = Field(default="log", pattern="^(log|twilio)$")
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    weather_enabled: bool = True

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        if self.app_env == "production":
            if self.jwt_secret == INSECURE_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET precisa ser forte em produção.")
            if self.sms_provider == "twilio" and not (
                self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number
            ):
                raise ValueError("Credenciais do Twilio ausentes.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
