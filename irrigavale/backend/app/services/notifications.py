"""Envio de SMS. A implementação é trocada por configuração (SMS_PROVIDER)."""

import logging
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.models import AlertKind, Farm
from app.services.time_utils import in_quiet_hours

logger = logging.getLogger(__name__)

SMS_KINDS = frozenset({AlertKind.critical, AlertKind.done, AlertKind.device})


class SmsSender(Protocol):
    async def send(self, to: str, body: str) -> bool: ...


class LogSmsSender:
    """Usado em desenvolvimento e testes: registra o SMS em vez de enviá-lo."""

    async def send(self, to: str, body: str) -> bool:
        logger.info("[SMS simulado] para=%s corpo=%s", _mask(to), body)
        return True


class TwilioSmsSender:
    API_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

    def __init__(self, account_sid: str, auth_token: str, from_number: str) -> None:
        self._sid = account_sid
        self._auth = (account_sid, auth_token)
        self._from = from_number

    async def send(self, to: str, body: str) -> bool:
        url = self.API_URL.format(sid=self._sid)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    url, auth=self._auth, data={"To": to, "From": self._from, "Body": body}
                )
            response.raise_for_status()
            return True
        except httpx.HTTPError:
            logger.exception("Falha ao enviar SMS para %s", _mask(to))
            return False


def get_sms_sender() -> SmsSender:
    settings = get_settings()
    if settings.sms_provider == "twilio":
        return TwilioSmsSender(
            settings.twilio_account_sid or "",
            settings.twilio_auth_token or "",
            settings.twilio_from_number or "",
        )
    return LogSmsSender()


async def send_alert_sms(farm: Farm, body: str, now_local_time) -> bool:
    """Envia SMS se o produtor ativou e se não estamos no horário de silêncio."""
    if not farm.sms_enabled or not farm.sms_phone:
        return False
    if in_quiet_hours(now_local_time, farm.quiet_hours_start, farm.quiet_hours_end):
        return False
    return await get_sms_sender().send(farm.sms_phone, body)


def _mask(phone: str) -> str:
    return "*" * max(len(phone) - 4, 0) + phone[-4:]
