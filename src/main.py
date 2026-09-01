import json
import os
from src.workflow import run_workflow, export_workflow
from src.models import EvidenceRecord


TEST_CASES = [
    {
        "id": 1,
        "input": "I was charged twice for my subscription.",
        "expected_category": "billing",
        "expected_confidence_min": 0.80,
        "expected_risk": ["low", "medium"],
        "expected_route": "billing_team",
        "expected_status": "routed",
    },
    {
        "id": 2,
        "input": "My internet keeps disconnecting randomly.",
        "expected_category": "technical",
        "expected_confidence_min": 0.50,
        "expected_risk": ["low", "medium", "high"],
        "expected_route": "technical_team",
        "expected_status": "routed",
    },
    {
        "id": 3,
        "input": "I want to upgrade my plan to enterprise.",
        "expected_category": "sales",
        "expected_confidence_min": 0.50,
        "expected_risk": ["low", "medium", "high"],
        "expected_route": "sales_team",
        "expected_status": "routed",
    },
    {
        "id": 4,
        "input": "I found a bug in your mobile app login.",
        "expected_category": "technical",
        "expected_confidence_min": 0.50,
        "expected_risk": ["low", "medium", "high"],
        "expected_route": "technical_team",
        "expected_status": "routed",
    },
    {
        "id": 5,
        "input": "Just saying hello, not a real issue.",
        "expected_category": "other",
        "expected_confidence_min": 0.0,
        "expected_risk": ["low", "medium", "high"],
        "expected_route": "human_review",
        "expected_status": "human_review",
    },
]


def run_tests():
    passed = 0
    failed = 0
    results = []

    for case in TEST_CASES:
        result = run_workflow(case["input"])
        evidence = export_workflow(result)

        ok = True
        failures = []

        if result.ai_output is None:
            ok = False
            failures.append("AI output is None")
        else:
            if result.ai_output.category != case["expected_category"]:
                ok = False
                failures.append(f"category: got {result.ai_output.category}, want {case['expected_category']}")
            if result.ai_output.confidence < case["expected_confidence_min"]:
                ok = False
                failures.append(f"confidence: got {result.ai_output.confidence}, want >= {case['expected_confidence_min']}")
            if result.ai_output.risk not in case["expected_risk"]:
                ok = False
                failures.append(f"risk: got {result.ai_output.risk}, want one of {case['expected_risk']}")
            if result.route_to != case["expected_route"]:
                ok = False
                failures.append(f"route: got {result.route_to}, want {case['expected_route']}")
            if result.status != case["expected_status"]:
                ok = False
                failures.append(f"status: got {result.status}, want {case['expected_status']}")

        if ok:
            passed += 1
            status = "PASS"
        else:
            failed += 1
            status = "FAIL"

        print(f"Test {case['id']}: {status}")
        for f in failures:
            print(f"  - {f}")

        results.append({
            "test_id": case["id"],
            "input": case["input"],
            "result": {
                "category": result.ai_output.category if result.ai_output else None,
                "confidence": result.ai_output.confidence if result.ai_output else None,
                "risk": result.ai_output.risk if result.ai_output else None,
                "route_to": result.route_to,
                "status": result.status,
                "error_reason": result.error_reason,
            },
            "evidence_path": evidence.get("export_path"),
            "log_path": evidence.get("log_path"),
            "status": status,
        })

    print(f"\n{passed} passed, {failed} failed out of {len(TEST_CASES)}")
    return results


if __name__ == "__main__":
    run_tests()
