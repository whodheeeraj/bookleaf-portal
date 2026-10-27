"""Typed application configuration loaded from environment variables / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AIProvider = Literal["mock", "openai", "anthropic", "slm_cloud", "slm_local"]
Environment = Literal["development", "staging", "production", "test"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- application -------------------------------------------------------
    app_name: str = "BookLeaf Author Support Portal"
    app_version: str = "1.0.0"
    environment: Environment = "development"
    debug: bool = False
    log_level: str = "INFO"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # IANA timezone used to interpret admin date filters (calendar dates).
    display_timezone: str = "Asia/Kolkata"

    # --- database ----------------------------------------------------------
    database_url: str = "postgresql+asyncpg://bookleaf:bookleaf@localhost:5432/bookleaf"
    database_echo: bool = False
    auto_create_tables: bool = False

    # --- auth --------------------------------------------------------------
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # --- seed / bootstrap --------------------------------------------------
    seed_default_password: str = "password123"
    admin_id: str = "ADMIN001"
    admin_name: str = "Aarav Mehta"
    admin_email: str = "admin@bookleaf.com"
    admin_password: str = "password123"
    seed_data_path: str = "data/bookleaf_sample_data.json"

    # --- AI / SLM ----------------------------------------------------------
    ai_provider: AIProvider = "mock"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: SecretStr | None = None
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = Field(default=8.0, gt=0, le=60)
    ai_max_retries: int = Field(default=1, ge=0, le=3)
    ai_total_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    ai_temperature: float = Field(default=0.2, ge=0, le=1)
    ai_max_output_tokens: int = Field(default=700, ge=150, le=4000)
    ai_two_pass: bool = False

    ai_fallback_provider: str | None = None
    ai_fallback_base_url: str | None = None
    ai_fallback_api_key: SecretStr | None = None
    ai_fallback_model: str | None = None

    # --- realtime ----------------------------------------------------------
    sse_heartbeat_seconds: int = 15

    # --- validators --------------------------------------------------------
    @field_validator("database_url")
    @classmethod
    def _coerce_async_driver(cls, value: str) -> str:
        """Accept plain postgres:// / sqlite:// URLs and add the async driver."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        if value.startswith("sqlite://") and "+aiosqlite" not in value:
            return value.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return value

    # --- derived helpers ---------------------------------------------------
    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def api_key(self) -> str | None:
        return self.ai_api_key.get_secret_value() if self.ai_api_key else None

    @property
    def fallback_api_key(self) -> str | None:
        return self.ai_fallback_api_key.get_secret_value() if self.ai_fallback_api_key else None

    @property
    def ai_provider_ready(self) -> bool:
        """True when the active provider has everything it needs to be called."""
        if self.ai_provider == "mock":
            return True
        if self.ai_provider == "slm_local":
            return True  # keyless local runtimes are fine
        return bool(self.api_key)

    @property
    def fallback_configured(self) -> bool:
        return bool(self.ai_fallback_provider and self.ai_fallback_model)

    def safe_summary(self) -> dict[str, str | bool]:
        """Non-secret config snapshot used in startup logs and /api/health."""
        return {
            "provider": self.ai_provider,
            "model": self.ai_model,
            "configured": self.ai_provider_ready,
            "fallback_enabled": self.fallback_configured,
            "two_pass": self.ai_two_pass,
            "timeout_seconds": self.ai_timeout_seconds,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
