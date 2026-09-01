from src.config import ALLOWED_CATEGORIES, ALLOWED_RISKS, DEFAULT_ROUTES


def route(category: str, needs_human: bool, risk: str) -> str:
    if needs_human:
        return "human_review"
    if risk == "high":
        return "human_review"
    if category not in ALLOWED_CATEGORIES:
        return "error"
    return DEFAULT_ROUTES.get(category, "general_team")
