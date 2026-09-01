import json
import os
from datetime import datetime, timezone

from src.models import WorkflowResult, AIOutput
from src.config import (
    ALLOWED_CATEGORIES,
    ALLOWED_RISKS,
    CONFIDENCE_THRESHOLD,
    FAILURE_CODES,
    utcnow_iso,
)
from src.classifier import classify
from src.models import ParseError
from src.routes import route


def receive(text: str) -> str:
    return text.strip()


def normalize(text: str) -> str:
    text = text.lower().strip()
    text = " ".join(text.split())
    return text


def validate(ai_output: AIOutput) -> tuple[bool, str]:
    if ai_output.category not in ALLOWED_CATEGORIES:
        return False, f"Invalid category: {ai_output.category}"

    if not isinstance(ai_output.confidence, (int, float)):
        return False, "Confidence is not a number"

    if not (0.0 <= ai_output.confidence <= 1.0):
        return False, f"Confidence out of range: {ai_output.confidence}"

    if ai_output.risk not in ALLOWED_RISKS:
        return False, f"Invalid risk: {ai_output.risk}"

    if not isinstance(ai_output.needs_human, bool):
        return False, "needs_human is not a boolean"

    if not isinstance(ai_output.summary, str) or len(ai_output.summary.strip()) == 0:
        return False, "Summary is empty"

    if len(ai_output.summary.split()) > 20:
        return False, "Summary exceeds 20 words"

    if ai_output.risk == "high" and not ai_output.needs_human:
        return False, "High risk requires human review"

    if ai_output.confidence < CONFIDENCE_THRESHOLD and not ai_output.needs_human:
        return False, "Low confidence requires human review"

    return True, ""


def run_workflow(input_text: str) -> WorkflowResult:
    # Step 1: Validate input
    if not isinstance(input_text, str) or not input_text.strip():
        return WorkflowResult(
            input_text=input_text if isinstance(input_text, str) else str(input_text),
            normalized_text="",
            ai_output=None,
            route_to="error",
            status="error",
            error_reason=f"{FAILURE_CODES['INPUT']}_error: empty or malformed input",
        )

    # Step 2: Normalize input
    normalized = normalize(input_text)

    # Step 3: Classify
    try:
        ai_output = classify(normalized)
    except ParseError as exc:
        return WorkflowResult(
            input_text=input_text,
            normalized_text=normalized,
            ai_output=None,
            route_to="error",
            status="error",
            error_reason=f"{FAILURE_CODES['PARSE']}_error: parse failure: {exc}",
        )
    except Exception as exc:
        return WorkflowResult(
            input_text=input_text,
            normalized_text=normalized,
            ai_output=None,
            route_to="error",
            status="error",
            error_reason=f"{FAILURE_CODES['API']}: classifier exception: {exc}",
        )

    # Step 4: Validate AI output
    is_valid, error_reason = validate(ai_output)

    if not is_valid:
        return WorkflowResult(
            input_text=input_text,
            normalized_text=normalized,
            ai_output=ai_output,
            route_to="error",
            status="error",
            error_reason=f"{FAILURE_CODES['VALIDATION']}: {error_reason}",
        )

    # Step 5: Route request
    route_to = route(
        ai_output.category,
        ai_output.needs_human,
        ai_output.risk,
    )

    # Step 6: Apply confidence policy
    if ai_output.confidence < CONFIDENCE_THRESHOLD:
        route_to = "human_review"

    # Step 7: Apply high-risk policy
    if ai_output.risk == "high":
        route_to = "human_review"

    # Step 8: Set final status
    status = "routed"

    if route_to == "human_review":
        status = "human_review"
    elif route_to == "error":
        status = "error"

    # Step 9: Return workflow result
    return WorkflowResult(
        input_text=input_text,
        normalized_text=normalized,
        ai_output=ai_output,
        route_to=route_to,
        status=status,
        error_reason=None,
    )


def export_workflow(result: WorkflowResult, export_dir: str = "exports") -> dict:
    os.makedirs(export_dir, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    evidence = {
        "timestamp": result.timestamp,
        "input_text": result.input_text,
        "normalized_text": result.normalized_text,
        "ai_output": {
            "category": result.ai_output.category if result.ai_output else None,
            "confidence": result.ai_output.confidence if result.ai_output else None,
            "summary": result.ai_output.summary if result.ai_output else None,
            "risk": result.ai_output.risk if result.ai_output else None,
            "needs_human": result.ai_output.needs_human if result.ai_output else None,
        },
        "route_to": result.route_to,
        "status": result.status,
        "error_reason": result.error_reason,
    }

    export_path = os.path.join(
        export_dir,
        f"workflow_export_{timestamp}.json",
    )

    log_path = os.path.join(
        export_dir,
        f"workflow_log_{timestamp}.json",
    )

    with open(export_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2)

    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2)

    evidence["export_path"] = export_path
    evidence["log_path"] = log_path

    return evidence