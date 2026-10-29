"""Validated runtime configuration for the Brain service."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration is loaded from environment variables; secrets are never hard-coded."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Pharmacy ERP Brain"
    app_version: str = "0.1.0"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"
    # Intentionally optional until database roles are provisioned for local development.
    brain_db_url: SecretStr | None = Field(default=None, repr=False)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one validated settings instance per process."""
    return Settings()
