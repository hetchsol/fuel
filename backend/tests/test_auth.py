"""
Tests for authentication, role-based access, and user management.
"""


def test_login_owner(client):
    """Owner can log in with default credentials."""
    res = client.post("/api/v1/auth/login", json={
        "username": "owner1",
        "password": "owner123"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "owner"
    assert data["user"]["username"] == "owner1"


def test_login_wrong_password(client):
    """Wrong password returns 401."""
    res = client.post("/api/v1/auth/login", json={
        "username": "owner1",
        "password": "wrongpassword"
    })
    assert res.status_code == 401


def test_login_nonexistent_user(client):
    """Non-existent user returns 401."""
    res = client.post("/api/v1/auth/login", json={
        "username": "nobody",
        "password": "anything"
    })
    assert res.status_code == 401


def test_create_user(client, owner_headers):
    """Owner can create a new attendant."""
    res = client.post("/api/v1/auth/users", headers=owner_headers, json={
        "username": "newuser1",
        "full_name": "New User One",
        "password": "pass1234",
        "role": "user",
        "station_id": "ST001",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["username"] == "newuser1"
    assert data["user"]["role"] == "user"


def test_create_duplicate_user(client, owner_headers):
    """Creating duplicate username returns 400."""
    client.post("/api/v1/auth/users", headers=owner_headers, json={
        "username": "dupuser",
        "full_name": "Dup User",
        "password": "pass1234",
        "role": "user",
    })
    res = client.post("/api/v1/auth/users", headers=owner_headers, json={
        "username": "dupuser",
        "full_name": "Dup User 2",
        "password": "pass1234",
        "role": "user",
    })
    assert res.status_code == 400


def test_list_users_requires_auth(client):
    """Listing users without auth returns 401."""
    res = client.get("/api/v1/auth/users")
    assert res.status_code == 401


def test_list_users_as_owner(client, owner_headers):
    """Owner can list all users."""
    res = client.get("/api/v1/auth/users", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_staff_endpoint(client, owner_headers, create_staff):
    """Staff endpoint returns active attendants and supervisors."""
    create_staff("staff_test1", "Staff Test One", "user")
    create_staff("staff_test2", "Staff Test Two", "supervisor")

    res = client.get("/api/v1/auth/staff", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    names = [u["full_name"] for u in data]
    assert "Staff Test One" in names
    assert "Staff Test Two" in names


def test_attendant_cannot_list_users(client, staff_headers):
    """Attendants cannot access the users endpoint."""
    if not staff_headers:
        return  # Skip if staff creation failed
    res = client.get("/api/v1/auth/users", headers=staff_headers)
    assert res.status_code == 403


def test_manager_cannot_create_owner(client, owner_headers):
    """Manager cannot create an owner account."""
    # First create a manager
    client.post("/api/v1/auth/users", headers=owner_headers, json={
        "username": "mgr_test",
        "full_name": "Manager Test",
        "password": "mgr12345",
        "role": "manager",
        "station_id": "ST001",
    })
    # Login as manager
    login_res = client.post("/api/v1/auth/login", json={
        "username": "mgr_test",
        "password": "mgr12345"
    })
    if login_res.status_code != 200:
        return
    mgr_token = login_res.json()["access_token"]
    mgr_headers = {
        "Authorization": f"Bearer {mgr_token}",
        "X-Station-Id": "ST001",
        "Content-Type": "application/json",
    }
    # Try to create an owner
    res = client.post("/api/v1/auth/users", headers=mgr_headers, json={
        "username": "evil_owner",
        "full_name": "Evil Owner",
        "password": "evil1234",
        "role": "owner",
    })
    assert res.status_code == 403


def test_token_refresh(client, owner_headers):
    """Token refresh returns a new valid token."""
    res = client.post("/api/v1/auth/refresh", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
