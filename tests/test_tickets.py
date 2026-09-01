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


def test_high_risk_request_enters_review_queue(auth_headers):
    response = client.post("/requests", json={
        "text": "Someone hacked my account and made an unauthorized payment."
    }, headers=auth_headers)
    assert response.status_code == 200

    review_response = client.get("/requests/review", headers=auth_headers)
    assert review_response.status_code == 200
    data = review_response.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["status"] == "human_review"
    assert data["results"][0]["risk"] == "high"


def test_low_confidence_request_enters_review_queue(auth_headers):
    response = client.post("/requests", json={
        "text": "Just saying hello, not a real issue."
    }, headers=auth_headers)
    assert response.status_code == 200

    review_response = client.get("/requests/review", headers=auth_headers)
    assert review_response.status_code == 200
    data = review_response.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["status"] == "human_review"


def test_review_queue_returns_only_organization_requests(auth_headers):
    client.post("/requests", json={
        "text": "I was charged twice for my subscription."
    }, headers=auth_headers)

    other_response = client.post("/auth/register", json={
        "name": "Other User",
        "email": "other@example.com",
        "password": "password123",
    })
    other_token = other_response.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    client.post("/requests", json={
        "text": "My internet keeps disconnecting randomly."
    }, headers=other_headers)

    review_response = client.get("/requests/review", headers=auth_headers)
    assert review_response.status_code == 200
    data = review_response.json()
    assert len(data["results"]) == 0


def test_unauthorized_review_queue_access():
    response = client.get("/requests/review")
    assert response.status_code == 401


def test_status_update_works(auth_headers):
    post_response = client.post("/requests", json={
        "text": "I want to upgrade my plan to enterprise."
    }, headers=auth_headers)
    request_id = post_response.json()["id"]

    patch_response = client.patch(f"/requests/{request_id}/status", json={
        "status": "triaged"
    }, headers=auth_headers)
    assert patch_response.status_code == 200
    data = patch_response.json()
    assert data["status"] == "triaged"


def test_assignment_works(auth_headers):
    post_response = client.post("/requests", json={
        "text": "I want to upgrade my plan to enterprise."
    }, headers=auth_headers)
    request_id = post_response.json()["id"]

    me_response = client.get("/auth/me", headers=auth_headers)
    me_data = me_response.json()
    user_id = me_data["id"]

    patch_response = client.patch(f"/requests/{request_id}/status", json={
        "status": "assigned",
        "assigned_to": user_id
    }, headers=auth_headers)
    assert patch_response.status_code == 200
    data = patch_response.json()
    assert data["status"] == "assigned"
    assert data["assigned_to"] == user_id


def test_resolved_ticket_not_in_active_review_queue(auth_headers):
    post_response = client.post("/requests", json={
        "text": "I was charged twice for my subscription."
    }, headers=auth_headers)
    request_id = post_response.json()["id"]

    client.patch(f"/requests/{request_id}/status", json={
        "status": "resolved"
    }, headers=auth_headers)

    review_response = client.get("/requests/review", headers=auth_headers)
    assert review_response.status_code == 200
    data = review_response.json()
    assert len(data["results"]) == 0


def test_invalid_status_update_rejected(auth_headers):
    post_response = client.post("/requests", json={
        "text": "I was charged twice for my subscription."
    }, headers=auth_headers)
    request_id = post_response.json()["id"]

    patch_response = client.patch(f"/requests/{request_id}/status", json={
        "status": "invalid_status"
    }, headers=auth_headers)
    assert patch_response.status_code == 400


def test_other_organization_cannot_access_ticket(auth_headers):
    post_response = client.post("/requests", json={
        "text": "I was charged twice for my subscription."
    }, headers=auth_headers)
    request_id = post_response.json()["id"]

    other_response = client.post("/auth/register", json={
        "name": "Other User",
        "email": "other@example.com",
        "password": "password123",
    })
    other_token = other_response.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    get_response = client.get(f"/requests/{request_id}", headers=other_headers)
    assert get_response.status_code == 404

    patch_response = client.patch(f"/requests/{request_id}/status", json={
        "status": "triaged"
    }, headers=other_headers)
    assert patch_response.status_code == 404
