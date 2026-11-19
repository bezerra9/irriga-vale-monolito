class DomainError(Exception):
    """Erro de regra de negócio. O handler global converte em resposta HTTP."""

    status_code: int = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class ValidationRuleError(DomainError):
    status_code = 422


class AuthError(DomainError):
    status_code = 401
