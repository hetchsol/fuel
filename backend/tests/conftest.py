"""
Test configuration and fixtures.

Uses FastAPI's TestClient with in-memory storage (no database needed).
All tests run in isolation — no production data is touched.
"""
import pytest
import os
import sys

# Ensure no DATABASE_URL so tests use in-memory/file storage
os.environ.pop("DATABASE_URL", None)
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["TESTING"] = "1"

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """FastAPI test client — no real DB, uses in-memory storage."""
    return TestClient(app)


@pytest.fixture
def owner_token(client):
    """Get auth token for the default owner account."""
    res = client.post("/api/v1/auth/login", json={
        "username": "owner1",
        "password": "owner123"
    })
    assert res.status_code == 200
    return res.json()["access_token"]


@pytest.fixture
def owner_headers(owner_token):
    """Headers with owner auth token."""
    return {
        "Authorization": f"Bearer {owner_token}",
        "X-Station-Id": "ST001",
        "Content-Type": "application/json",
    }


@pytest.fixture
def create_staff(client, owner_headers):
    """Helper to create a staff member. Returns user data."""
    def _create(username, full_name, role="user", password="test1234"):
        res = client.post("/api/v1/auth/users", headers=owner_headers, json={
            "username": username,
            "full_name": full_name,
            "password": password,
            "role": role,
            "station_id": "ST001",
        })
        return res
    return _create


@pytest.fixture
def staff_token(client, create_staff):
    """Create a test attendant and return their auth token."""
    create_staff("test_att", "Test Attendant", "user")
    res = client.post("/api/v1/auth/login", json={
        "username": "test_att",
        "password": "test1234"
    })
    if res.status_code == 200:
        return res.json()["access_token"]
    return None


@pytest.fixture
def staff_headers(staff_token):
    """Headers with attendant auth token."""
    if not staff_token:
        return None
    return {
        "Authorization": f"Bearer {staff_token}",
        "X-Station-Id": "ST001",
        "Content-Type": "application/json",
    }
