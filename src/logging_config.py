import logging
import os
import sys
from typing import Optional

from src.config import ENVIRONMENT, DEBUG


class SensitiveDataFilter(logging.Filter):
    """Filter to prevent sensitive data from being logged."""

    SENSITIVE_PATTERNS = [
        "password",
        "secret",
        "token",
        "api_key",
        "authorization",
        "bearer",
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.msg)
        args = str(record.args) if record.args else ""
        combined = (msg + " " + args).lower()

        for pattern in self.SENSITIVE_PATTERNS:
            if pattern in combined:
                record.msg = "[REDACTED]"
                record.args = ()
                break

        return True


def setup_logging(
    level: Optional[str] = None,
    log_format: Optional[str] = None,
) -> None:
    """Configure application logging with sensitive data filtering."""
    level = level or os.getenv("LOG_LEVEL", "INFO" if not DEBUG else "DEBUG")
    log_format = log_format or os.getenv(
        "LOG_FORMAT",
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        if DEBUG
        else "%(asctime)s - %(levelname)s - %(message)s",
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler.setFormatter(logging.Formatter(log_format))
    handler.addFilter(SensitiveDataFilter())

    root_logger.addHandler(handler)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
