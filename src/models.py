from dataclasses import dataclass, field
from typing import Optional
from src.config import utcnow_iso


class ParseError(Exception):
    pass


ALLOWED_CATEGORIES = {"billing", "technical", "sales", "other"}
ALLOWED_RISKS = {"low", "medium", "high"}


@dataclass
class AIOutput:
    category: str
    confidence: float
    summary: str
    risk: str
    needs_human: bool

    def validate(self) -> list[str]:
        """Validate the structured AI output for Checkpoint 2."""
        errors = []

        if self.category not in ALLOWED_CATEGORIES:
            errors.append("invalid_category")

        if not isinstance(self.confidence, (int, float)):
            errors.append("invalid_confidence_type")
        elif not 0 <= self.confidence <= 1:
            errors.append("confidence_out_of_range")

        if not isinstance(self.summary, str) or not self.summary.strip():
            errors.append("missing_summary")
        elif len(self.summary.split()) > 20:
            errors.append("summary_too_long")

        if self.risk not in ALLOWED_RISKS:
            errors.append("invalid_risk")

        if self.risk == "high" and not self.needs_human:
            errors.append("high_risk_requires_human")

        if self.confidence < 0.70 and not self.needs_human:
            errors.append("low_confidence_requires_human")

        return errors


@dataclass
class WorkflowResult:
    input_text: str
    normalized_text: str
    ai_output: Optional[AIOutput]
    route_to: str
    status: str
    error_reason: Optional[str] = None
    timestamp: str = field(
        default_factory=utcnow_iso
    )


@dataclass
class EvidenceRecord:
    result: WorkflowResult
    export_path: str
    log_path: str