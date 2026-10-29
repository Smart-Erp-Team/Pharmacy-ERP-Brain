# syntax=docker/dockerfile:1
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app:/app/brain_db/python

WORKDIR /app

RUN addgroup --system brain && adduser --system --ingroup brain brain

COPY pyproject.toml ./pyproject.toml
COPY brain ./brain
COPY brain_db ./brain_db

RUN pip install --no-cache-dir \
      "alembic==1.20.0" \
      "fastapi>=0.115,<1.0" \
      "psycopg[binary]==3.3.6" \
      "pydantic-settings>=2.7,<3.0" \
      "sqlalchemy==2.1.6" \
      "sqlmodel==0.0.48" \
      "uvicorn[standard]>=0.34,<1.0" \
    && pip cache purge

USER brain
EXPOSE 8000

CMD ["uvicorn", "brain.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
