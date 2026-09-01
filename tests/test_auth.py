import pytest
from fastapi.testclient import TestClient

from src.api import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    from src.db import clear_all
    clear_all()
    yield


def test_register_creates_user_and_organization():
    response = client.post("/auth/register", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "securepass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate_email():
    client.post("/auth/register", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "securepass123",
    })
    response = client.post("/auth/register", json={
        "name": "Alice Again",
        "email": "alice@example.com",
        "password": "anotherpass123",
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_login_success():
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


def test_login_invalid_password():
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
    assert response.json()["detail"] == "Invalid email or password"


def test_login_nonexistent_user():
    response = client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "password123",
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_protected_endpoint_without_token():
    response = client.post("/requests", json={"text": "Hello"})
    assert response.status_code == 401


def test_get_me_with_valid_token():
    register_response = client.post("/auth/register", json={
        "name": "Dana",
        "email": "dana@example.com",
        "password": "securepass123",
    })
    token = register_response.json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Dana"
    assert data["email"] == "dana@example.com"
    assert "organization_id" in data
    assert "role" in data


def test_refresh_token_endpoint():
    register_response = client.post("/auth/register", json={
        "name": "Eve",
        "email": "eve@example.com",
        "password": "securepass123",
    })
    data = register_response.json()
    refresh_token = data["refresh_token"]

    response = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_works_when_user_id_differs_from_org_id():
    from src.db import clear_all, create_organization, create_membership, _connection

    clear_all()

    client.post("/auth/register", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "securepass123",
    })

    new_org_id = create_organization("New Org")

    conn = _connection()
    try:
        conn.execute("DELETE FROM memberships WHERE user_id = 1")
        conn.execute("INSERT INTO memberships (user_id, organization_id, role) VALUES (1, ?, ?)", (new_org_id, "admin"))
        conn.commit()
    finally:
        conn.close()

    response = client.post("/auth/login", json={
        "email": "alice@example.com",
        "password": "securepass123",
    })
    assert response.status_code == 200
    data = response.json()
    access_token = data["access_token"]

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["organization_id"] == new_org_id


def test_get_membership_finds_membership_without_org_id():
    from src.db import clear_all, create_user, create_organization, create_membership, get_membership

    clear_all()
    user_id = create_user("Test User", "test@example.com", "hash")
    org_id = create_organization("Test Org")
    create_membership(user_id, org_id, role="admin")

    membership = get_membership(user_id)
    assert membership is not None
    assert membership["organization_id"] == org_id
    assert membership["role"] == "admin"
