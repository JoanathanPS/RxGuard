# Build context is the repo root (see infra/docker-compose.yml).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Shared package first so service imports resolve at install/run time.
COPY shared /app/shared
RUN pip install --no-cache-dir /app/shared

# Then the service itself.
COPY services/prescription-service /app/service
WORKDIR /app/service
RUN pip install --no-cache-dir .

EXPOSE 8003

# Alembic migrations are applied by the compose entrypoint in later phases.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]