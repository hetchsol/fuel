"""
Regression for the user-creation 500: staff ids must stay unique after a delete.

Old logic generated STF{count+1}; after deleting a user the count no longer
matches the highest id, so it regenerated an existing id and the DB INSERT hit a
duplicate-primary-key (500). _next_staff_id now uses max+1.
"""
import app.api.v1.auth as auth


def test_next_staff_id_survives_deletions(monkeypatch):
    monkeypatch.setattr(auth, "_USE_DB", lambda: False)
    # STF003 was deleted — count is 3, so count+1 would re-issue STF004 (collision).
    monkeypatch.setattr(auth, "users_db", {
        "owner": {"user_id": "O001"},
        "a": {"user_id": "STF001"},
        "b": {"user_id": "STF002"},
        "d": {"user_id": "STF004"},
    })
    assert auth._next_staff_id() == "STF005"


def test_next_staff_id_on_clean_system(monkeypatch):
    monkeypatch.setattr(auth, "_USE_DB", lambda: False)
    monkeypatch.setattr(auth, "users_db", {"owner": {"user_id": "O001"}})
    assert auth._next_staff_id() == "STF001"


def test_create_delete_create_gives_distinct_ids(client, owner_headers, create_staff):
    r1 = create_staff("att_uc_a", "UC A", "user")
    r2 = create_staff("att_uc_b", "UC B", "user")
    assert r1.status_code == 200 and r2.status_code == 200
    id1, id2 = r1.json()["user"]["user_id"], r2.json()["user"]["user_id"]

    d = client.delete("/api/v1/auth/users/att_uc_a", headers=owner_headers)
    assert d.status_code == 200

    r3 = create_staff("att_uc_c", "UC C", "user")
    assert r3.status_code == 200          # would previously risk a colliding id
    id3 = r3.json()["user"]["user_id"]
    assert len({id1, id2, id3}) == 3       # all distinct
