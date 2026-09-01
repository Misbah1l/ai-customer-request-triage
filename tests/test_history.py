import random

import pytest
from fastapi.testclient import TestClient

from src.api import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_random():
    random.seed(42)
    yield


@pytest.fixture(autouse=True)
def clean_db():
    from src.db import clear_all
    clear_all()
    yield


@pytest.fixture()
def auth_headers():
    response = client.post("/auth/register", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123",
    })
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_post_request_persists(auth_headers):
    response = client.post("/requests", json={"text": "I was charged twice for my subscription."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
    assert isinstance(data["id"], int)
    assert data["ai_output"]["category"] == "billing"
    assert data["status"] == "routed"


def test_get_requests_returns_history(auth_headers):
    client.post("/requests", json={"text": "I was charged twice for my subscription."}, headers=auth_headers)
    client.post("/requests", json={"text": "My internet keeps disconnecting randomly."}, headers=auth_headers)

    response = client.get("/requests?limit=50", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 2
    assert data["results"][0]["category"] == "technical"
    assert data["results"][1]["category"] == "billing"


def test_get_requests_respects_limit(auth_headers):
    for i in range(5):
        client.post("/requests", json={"text": f"Test message number {i}"}, headers=auth_headers)

    response = client.get("/requests?limit=2", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 2


def test_get_request_by_id_returns_detail(auth_headers):
    post_response = client.post("/requests", json={"text": "I want to upgrade my plan to enterprise."}, headers=auth_headers)
    request_id = post_response.json()["id"]

    response = client.get(f"/requests/{request_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == request_id
    assert data["category"] == "sales"
    assert data["route_to"] == "sales_team"


def test_get_request_not_found_returns_404(auth_headers):
    response = client.get("/requests/99999", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Request not found"


def test_post_request_behavior_unchanged(auth_headers):
    response = client.post("/requests", json={"text": "Someone hacked my account and made an unauthorized payment."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["ai_output"]["risk"] == "high"
    assert data["route_to"] == "human_review"
    assert data["status"] == "human_review"
    assert data["ai_output"]["needs_human"] is True
