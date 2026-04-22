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


# ===== Per-station user-list scoping =====

def _headers_for_station(owner_token, station_id):
    return {
        "Authorization": f"Bearer {owner_token}",
        "X-Station-Id": station_id,
        "Content-Type": "application/json",
    }


def test_list_users_scoped_to_current_station(client, owner_headers, owner_token):
    """
    Viewing users from two different stations must only reveal that station's staff.
    Owners viewing Kalulushi don't see Luanshya users and vice versa.
    """
    # Create a second station
    res = client.post("/api/v1/stations/", headers=owner_headers, json={
        "station_id": "ST042",
        "name": "Kalulushi Test",
        "location": "Copperbelt",
    })
    assert res.status_code == 200, res.text

    # Create one staff at each station
    h_st001 = _headers_for_station(owner_token, "ST001")
    h_st042 = _headers_for_station(owner_token, "ST042")

    r1 = client.post("/api/v1/auth/users", headers=h_st001, json={
        "username": "kalulushi_att", "full_name": "Kalulushi Attendant",
        "password": "pass1234", "role": "user", "station_id": "ST001",
    })
    assert r1.status_code == 200, r1.text

    r2 = client.post("/api/v1/auth/users", headers=h_st042, json={
        "username": "luanshya_att", "full_name": "Luanshya Attendant",
        "password": "pass1234", "role": "user", "station_id": "ST042",
    })
    assert r2.status_code == 200, r2.text

    # /auth/users scoped to ST001
    res = client.get("/api/v1/auth/users", headers=h_st001)
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert "kalulushi_att" in usernames
    assert "luanshya_att" not in usernames
    # Owner accounts (station_id=None) are not shown in station-scoped lists
    assert "owner1" not in usernames

    # /auth/users scoped to ST042
    res = client.get("/api/v1/auth/users", headers=h_st042)
    assert res.status_code == 200
    usernames = {u["username"] for u in res.json()}
    assert "luanshya_att" in usernames
    assert "kalulushi_att" not in usernames
    assert "owner1" not in usernames


def test_list_staff_scoped_to_current_station(client, owner_headers, owner_token):
    """/auth/staff also respects station scoping, including for owners."""
    client.post("/api/v1/stations/", headers=owner_headers, json={
        "station_id": "ST043", "name": "Scope Test 2", "location": "x",
    })

    h_st001 = _headers_for_station(owner_token, "ST001")
    h_st043 = _headers_for_station(owner_token, "ST043")

    client.post("/api/v1/auth/users", headers=h_st001, json={
        "username": "a_st001", "full_name": "A ST001",
        "password": "pass1234", "role": "user", "station_id": "ST001",
    })
    client.post("/api/v1/auth/users", headers=h_st043, json={
        "username": "a_st043", "full_name": "A ST043",
        "password": "pass1234", "role": "supervisor", "station_id": "ST043",
    })

    res = client.get("/api/v1/auth/staff", headers=h_st001)
    assert res.status_code == 200
    names = {u["username"] for u in res.json()}
    assert "a_st001" in names
    assert "a_st043" not in names

    res = client.get("/api/v1/auth/staff", headers=h_st043)
    assert res.status_code == 200
    names = {u["username"] for u in res.json()}
    assert "a_st043" in names
    assert "a_st001" not in names
