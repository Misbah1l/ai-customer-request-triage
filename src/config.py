import os
from datetime import datetime, timedelta, timezone
from typing import Optional


def _get_env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on")


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# Application
APP_NAME = _get_env_str("APP_NAME", "AI Customer Request Triage")
ENVIRONMENT = _get_env_str("ENVIRONMENT", "development")
DEBUG = _get_env_bool("DEBUG", True)

# Database
DATABASE_PATH = _get_env_str("DATABASE_PATH", "data/requests.db")

# Authentication
SECRET_KEY = _get_env_str("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_to_a_random_secret_key")
ALGORITHM = _get_env_str("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = _get_env_int("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
REFRESH_TOKEN_EXPIRE_MINUTES = _get_env_int("REFRESH_TOKEN_EXPIRE_MINUTES", 10080)

# Password policy
MIN_PASSWORD_LENGTH = _get_env_int("MIN_PASSWORD_LENGTH", 8)

# Rate limiting (simple in-memory, per-process)
RATE_LIMIT_ENABLED = _get_env_bool("RATE_LIMIT_ENABLED", False)
RATE_LIMIT_LOGIN_ATTEMPTS = _get_env_int("RATE_LIMIT_LOGIN_ATTEMPTS", 5)
RATE_LIMIT_LOGIN_WINDOW_SECONDS = _get_env_int("RATE_LIMIT_LOGIN_WINDOW_SECONDS", 60)

# CORS
CORS_ORIGINS = _get_env_str("CORS_ORIGINS", "*").split(",")
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS if origin.strip()]

# Pagination
DEFAULT_PAGE_LIMIT = _get_env_int("DEFAULT_PAGE_LIMIT", 50)
MAX_PAGE_LIMIT = _get_env_int("MAX_PAGE_LIMIT", 200)

# AI/Classifier
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USE_MOCK_CLASSIFIER = OPENAI_API_KEY is None or OPENAI_API_KEY == ""

# Existing domain config
ALLOWED_CATEGORIES = ["billing", "technical", "sales", "other"]
ALLOWED_RISKS = ["low", "medium", "high"]
DEFAULT_ROUTES = {
    "billing": "billing_team",
    "technical": "technical_team",
    "sales": "sales_team",
    "other": "general_team",
}
CONFIDENCE_THRESHOLD = 0.80

FAILURE_CODES = {
    "INPUT": "input",
    "API": "api",
    "PARSE": "parse",
    "VALIDATION": "validation",
    "POLICY": "policy",
    "ROUTE": "route",
}

# Validation
if not DEBUG and SECRET_KEY == "CHANGE_ME_IN_PRODUCTION_to_a_random_secret_key":
    raise RuntimeError("SECRET_KEY must be set in production")
