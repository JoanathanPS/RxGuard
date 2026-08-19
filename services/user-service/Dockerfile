# Build context is the repo root (see infra/docker-compose.yml).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Shared package first so service imports resolve at install/run time.
COPY data /app/data
COPY shared /app/shared
RUN pip install --no-cache-dir /app/shared

# Then the service itself.
COPY services/user-service /app/service
WORKDIR /app/service
RUN pip install --no-cache-dir .

EXPOSE 8001

# Alembic migrations are applied by the compose entrypoint.
CMD ["uvicorn", "user_app.main:app", "--host", "0.0.0.0", "--port", "8001"]
