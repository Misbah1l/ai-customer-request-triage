import json
import os

import pytest

from src.evaluation import generate_evaluation_report


def test_generate_evaluation_report_creates_valid_json(tmp_path):
    report = generate_evaluation_report(export_dir=str(tmp_path))

    report_path = report["report_path"]
    assert os.path.exists(report_path)

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["checkpoint"] == "2"
    assert data["total_scenarios"] == 5
    assert data["passed"] == 5
    assert data["failed"] == 0
    assert len(data["results"]) == 5

    for result in data["results"]:
        assert "test_id" in result
        assert "scenario_type" in result
        assert "input" in result
        assert "expected" in result
        assert "actual" in result
        assert "error_code" in result
        assert "status" in result
        assert result["status"] in ("PASS", "FAIL")
        assert "latency_ms" in result
        assert isinstance(result["latency_ms"], (int, float))
        assert result["latency_ms"] >= 0

    normal = next(r for r in data["results"] if r["scenario_type"] == "normal")
    assert normal["actual"]["category"] == "billing"
    assert normal["actual"]["route_to"] == "billing_team"
    assert normal["actual"]["status"] == "routed"
    assert normal["status"] == "PASS"

    malformed = next(r for r in data["results"] if r["scenario_type"] == "malformed")
    assert malformed["actual"]["route_to"] == "error"
    assert malformed["actual"]["status"] == "error"
    assert malformed["error_code"] == "input"
    assert malformed["status"] == "PASS"
