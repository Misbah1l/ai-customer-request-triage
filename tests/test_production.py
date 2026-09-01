import pytest
from fastapi.testclient import TestClient

from src.api import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "environment" in data


def test_readiness_endpoint():
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert "ready" in data
    assert "database" in data
    assert "environment" in data
