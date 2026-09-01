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


@pytest.fixture()
def current_user_id(auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    return response.json()["id"]


@pytest.fixture()
def ticket_id(auth_headers):
    response = client.post("/requests", json={
        "text": "I was charged twice for my subscription."
    }, headers=auth_headers)
    assert response.status_code == 200
    return response.json()["id"]


def test_create_comment(auth_headers, ticket_id, current_user_id):
    response = client.post(f"/requests/{ticket_id}/comments", json={
        "content": "This needs urgent attention."
    }, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == ticket_id
    assert data["user_id"] == current_user_id
    assert data["user_name"] == "Test User"
    assert data["content"] == "This needs urgent attention."
    assert "created_at" in data


def test_list_comments_empty(auth_headers, ticket_id):
    response = client.get(f"/requests/{ticket_id}/comments", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []


def test_list_comments_returns_comments(auth_headers, ticket_id):
    client.post(f"/requests/{ticket_id}/comments", json={
        "content": "First comment"
    }, headers=auth_headers)
    client.post(f"/requests/{ticket_id}/comments", json={
        "content": "Second comment"
    }, headers=auth_headers)

    response = client.get(f"/requests/{ticket_id}/comments", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 2
    assert data["results"][0]["content"] == "First comment"
    assert data["results"][1]["content"] == "Second comment"


def test_comment_requires_authentication(ticket_id):
    response = client.post(f"/requests/{ticket_id}/comments", json={
        "content": "Anonymous comment"
    })
    assert response.status_code == 401


def test_comment_requires_ticket_to_exist(auth_headers):
    response = client.post("/requests/99999/comments", json={
        "content": "Comment on missing ticket"
    }, headers=auth_headers)
    assert response.status_code == 404


def test_comment_requires_content(auth_headers, ticket_id):
    response = client.post(f"/requests/{ticket_id}/comments", json={
        "content": ""
    }, headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Comment content is required"


def test_other_organization_cannot_comment(auth_headers, ticket_id):
    other_response = client.post("/auth/register", json={
        "name": "Other User",
        "email": "other@example.com",
        "password": "password123",
    })
    other_token = other_response.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = client.post(f"/requests/{ticket_id}/comments", json={
        "content": "Cross-org comment"
    }, headers=other_headers)
    assert response.status_code == 404


def test_other_organization_cannot_view_comments(auth_headers, ticket_id):
    client.post(f"/requests/{ticket_id}/comments", json={
        "content": "Org A comment"
    }, headers=auth_headers)

    other_response = client.post("/auth/register", json={
        "name": "Other User",
        "email": "other@example.com",
        "password": "password123",
    })
    other_token = other_response.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = client.get(f"/requests/{ticket_id}/comments", headers=other_headers)
    assert response.status_code == 404
