"""Structured JSON logging for stdout.

Every service logs newline-delimited JSON to stdout so that later phases can
ship those lines to the ELK stack (docker-compose.monitoring.yml) without
re-writing any application code. Non-JSON (human) formatting is used when
running under a debugger or with RXGUARD_LOG_FORMAT=text.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        for key in ("service", "request_id", "user_id", "entity_id"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, default=str)


def setup_logging(*, service: str = "rxguard", level: int = logging.INFO) -> None:
    """Configure the root logger once per process."""
    handler = logging.StreamHandler(sys.stdout)
    if os.getenv("RXGUARD_LOG_FORMAT", "json").lower() == "text":
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
    else:
        handler.setFormatter(JsonFormatter())
    handler.addFilter(_ServiceFilter(service))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


class _ServiceFilter(logging.Filter):
    def __init__(self, service: str) -> None:
        super().__init__()
        self._service = service

    def filter(self, record: logging.LogRecord) -> bool:
        record.service = self._service  # type: ignore[attr-defined]
        return True
