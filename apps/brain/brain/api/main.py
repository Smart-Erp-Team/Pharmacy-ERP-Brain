"""FastAPI application entry point.

This first slice intentionally exposes operational endpoints only. Business endpoints are added
when their contracts and use cases are implemented; no placeholder business responses are returned.
"""

from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from brain.config import get_settings

settings = get_settings()


@lru_cache(maxsize=1)
def _database_engine(url: str):
    """Create one least-privilege runtime engine; the DB module rejects unsafe logins."""
    from brain.db.session import create_brain_engine

    return create_brain_engine(
        url,
        role="brain_app",
        pool_size=1,
        max_overflow=0,
        connect_args={"connect_timeout": 2},
    )


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI intelligence service for Pharmacy ERP.",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    openapi_url="/openapi.json" if settings.app_env != "production" else None,
)


@app.get("/health/live", tags=["health"], summary="Liveness probe")
def liveness() -> dict[str, str]:
    """Return success when the process can serve HTTP requests."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"], summary="Readiness probe")
def readiness() -> JSONResponse:
    """Do not claim readiness until required runtime configuration is present."""
    if settings.brain_db_url is None:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "database_not_configured"},
        )
    try:
        url = settings.brain_db_url.get_secret_value()
        with _database_engine(url).connect() as connection:
            connection.execute(text("SELECT 1"))
    except (SQLAlchemyError, RuntimeError, ValueError, KeyError):
        # Do not leak DSNs, credentials, SQL details, or database topology in health responses.
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "database_unavailable"},
        )
    return JSONResponse(status_code=200, content={"status": "ok"})


@app.get(f"{settings.api_prefix}/system/info", tags=["system"], summary="Service metadata")
def system_info() -> dict[str, str]:
    """Expose non-sensitive service metadata for local diagnostics."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }
