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


def test_register_creates_user():
    response = client.post("/auth/register", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "securepass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_returns_token():
    client.post("/auth/register", json={
        "name": "Bob",
        "email": "bob@example.com",
        "password": "securepass123",
    })

    response = client.post("/auth/login", json={
        "email": "bob@example.com",
        "password": "securepass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials():
    client.post("/auth/register", json={
        "name": "Charlie",
        "email": "charlie@example.com",
        "password": "securepass123",
    })

    response = client.post("/auth/login", json={
        "email": "charlie@example.com",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


def test_protected_endpoint_without_auth():
    response = client.post("/requests", json={"text": "I was charged twice for my subscription."})
    assert response.status_code == 401


def test_get_me_returns_user(auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test User"
    assert data["email"] == "test@example.com"


def test_normal_billing_request(auth_headers):
    response = client.post("/requests", json={"text": "I was charged twice for my subscription."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["ai_output"]["category"] == "billing"
    assert data["route_to"] == "billing_team"
    assert data["status"] == "routed"
    assert data["ai_output"]["confidence"] > 0.80


def test_technical_request(auth_headers):
    response = client.post("/requests", json={"text": "My internet keeps disconnecting randomly."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["ai_output"]["category"] == "technical"
    assert data["route_to"] == "technical_team"
    assert data["status"] == "routed"
    assert data["ai_output"]["confidence"] > 0.70


def test_high_risk_request(auth_headers):
    response = client.post("/requests", json={"text": "Someone hacked my account and made an unauthorized payment."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["ai_output"]["category"] == "other"
    assert data["ai_output"]["risk"] == "high"
    assert data["route_to"] == "human_review"
    assert data["status"] == "human_review"
    assert data["ai_output"]["needs_human"] is True


def test_malformed_empty_request(auth_headers):
    response = client.post("/requests", json={"text": ""}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["route_to"] == "error"
    assert data["status"] == "error"
    assert data["error_reason"] is not None
    assert "input_error" in data["error_reason"]


def test_human_review_routing(auth_headers):
    response = client.post("/requests", json={"text": "Just saying hello, not a real issue."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["route_to"] == "human_review"
    assert data["status"] == "human_review"


def test_stats_are_org_scoped(auth_headers):
    client.post("/requests", json={"text": "I was charged twice for my subscription."}, headers=auth_headers)

    other_response = client.post("/auth/register", json={
        "name": "Other User",
        "email": "other@example.com",
        "password": "password123",
    })
    other_token = other_response.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    client.post("/requests", json={"text": "My internet keeps disconnecting randomly."}, headers=other_headers)

    response = client.get("/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1

    response = client.get("/stats", headers=other_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
