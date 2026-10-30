# Pharmacy ERP Brain

The Brain is the AI intelligence service for Pharmacy ERP. Its database contract, migrations, SQLModel
mappings, tenant isolation and runtime session rules live in [`brain_db/`](brain_db/README.md).

## Current implementation status

This repository currently provides the Brain domain contracts and database scaffolding plus the first
HTTP/runtime foundation. The API slice includes liveness, conservative readiness, and non-sensitive
service metadata endpoints. It does **not** yet implement ERP ingestion, forecasting, recommendations,
LLM agents, or database-backed business endpoints. Those must be delivered as contract-driven vertical
slices with tests; do not infer production readiness from the health endpoint.

## Requirements

- Python 3.11 (matches the current Brain database CI workflow)
- `uv` for reproducible local dependency management
- Docker Engine / Docker Desktop for container work
- PostgreSQL 16 for database integration tests (see `brain_db/README.md`)

## Local setup

From `apps/brain/`:

```bash
uv sync --group dev
cp .env.example .env
uv run uvicorn brain.api.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the development OpenAPI page. Check `GET /health/live` for
process liveness. `GET /health/ready` returns `503` until `BRAIN_DB_URL` is configured and the database is reachable
using the required least-privilege `brain_app` role. The connection check uses the existing runtime-role
validation and never returns credentials or raw database errors.

## Quality checks

```bash
uv run pytest tests
uv run ruff check brain tests
uv run ruff format --check brain tests
```

The existing PostgreSQL integration and isolation suite is separate and requires the setup described in
[`brain_db/tests/integration/README.md`](brain_db/tests/integration/README.md). Do not run it against a
shared or production database.

## Container

Build from this directory:

```bash
docker build -t pharmacy-erp-brain:dev .
docker run --rm -p 8000:8000 pharmacy-erp-brain:dev
```

The container runs as a non-root user. Database connectivity is not faked; provision the
least-privilege runtime role and configure `BRAIN_DB_URL` to pass readiness.
