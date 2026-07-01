"""API test suite — auth, tenant isolation, violation lifecycle, imports,
photo evidence, letters, analytics, activity, demo seed.

Run: pytest tests/ -q
"""
import base64
import io
import os
import sys

# Isolated throwaway DB — must be set before importing the app.
TEST_DB = "test_hoa_tracker.db"
os.environ["DATABASE_URL"] = f"sqlite:///./{TEST_DB}"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from main import app  # noqa: E402

# 1x1 transparent PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
    for f in (TEST_DB,):
        if os.path.exists(f):
            os.remove(f)


def register(client, email, password="password123"):
    res = client.post("/auth/register", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="session")
def alice(client):
    return register(client, "alice@example.com")


@pytest.fixture(scope="session")
def bob(client):
    return register(client, "bob@example.com")


@pytest.fixture(scope="session")
def hoa(client, alice):
    res = client.post("/hoas", json={
        "name": "Sunridge Estates", "address": "1 Sunridge Way, Austin, TX",
        "email": "board@sunridge.org", "contact_person_name": "Pat Boardman",
        "phone": "555-1000",
    }, headers=alice)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture(scope="session")
def resident(client, alice, hoa):
    res = client.post("/residents", json={
        "hoa_id": hoa["id"], "name": "Jane Smith", "unit": "101", "email": "jane@example.com",
    }, headers=alice)
    assert res.status_code == 200, res.text
    return res.json()


# ---------- Auth ----------

def test_register_rejects_bad_email(client):
    res = client.post("/auth/register", json={"email": "not-an-email", "password": "password123"})
    assert res.status_code == 400


def test_register_rejects_short_password(client):
    res = client.post("/auth/register", json={"email": "shortpw@example.com", "password": "short"})
    assert res.status_code == 400


def test_login_wrong_password(client, alice):
    res = client.post("/auth/login", json={"email": "alice@example.com", "password": "wrong-password"})
    assert res.status_code == 401


def test_login_case_insensitive_email(client, alice):
    res = client.post("/auth/login", json={"email": "ALICE@example.com", "password": "password123"})
    assert res.status_code == 200


def test_requests_without_token_rejected(client):
    assert client.get("/hoas").status_code in (401, 403)


# ---------- Tenant isolation ----------

def test_other_user_cannot_see_hoa(client, bob, hoa):
    assert client.get(f"/hoas/{hoa['id']}", headers=bob).status_code == 404
    assert client.get(f"/hoas/{hoa['id']}/analytics", headers=bob).status_code == 404
    assert client.get(f"/hoas/{hoa['id']}/activity", headers=bob).status_code == 404
    assert client.get(f"/residents?hoa_id={hoa['id']}", headers=bob).status_code == 404


def test_other_user_cannot_touch_violation(client, alice, bob, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Noise Complaint", "description": "Loud parties",
    }, headers=alice).json()
    assert client.get(f"/violations/{v['id']}/letter", headers=bob).status_code == 404
    assert client.patch(f"/violations/{v['id']}", json={"status": "resolved"}, headers=bob).status_code == 404
    assert client.delete(f"/violations/{v['id']}", headers=bob).status_code == 404
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Violation lifecycle ----------

def test_violation_lifecycle(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Landscaping / Lawn Care", "description": "Grass over 6 inches",
        "priority": "high", "due_in_days": 7,
    }, headers=alice).json()
    assert v["status"] == "open" and v["priority"] == "high"
    assert v["due_date"] is not None and v["note_count"] == 1

    # Fine, then mark paid
    upd = client.patch(f"/violations/{v['id']}", json={"fine_amount": 75}, headers=alice).json()
    assert upd["fine_amount"] == 75
    upd = client.patch(f"/violations/{v['id']}", json={"fine_paid": True}, headers=alice).json()
    assert upd["fine_paid"] is True

    # Email sent → noticed + first notice
    sent = client.post(f"/violations/{v['id']}/mark-sent", headers=alice).json()
    assert sent["violation"]["status"] == "noticed"
    assert sent["violation"]["notice_level"] == 1

    # Escalate → level 2 + escalated
    esc = client.post(f"/violations/{v['id']}/escalate", headers=alice).json()
    assert esc["notice_level"] == 2 and esc["status"] == "escalated"

    # Resolve records timestamp
    res = client.patch(f"/violations/{v['id']}", json={"status": "resolved", "note": "Resolution: mowed"}, headers=alice).json()
    assert res["status"] == "resolved" and res["resolved_at"] is not None

    # Notes carry the audit trail
    notes = client.get(f"/violations/{v['id']}/notes", headers=alice).json()
    bodies = " | ".join(n["body"] for n in notes)
    assert "cure period" in bodies and "Escalated" in bodies and "Resolution: mowed" in bodies


def test_escalation_caps_at_max(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Fencing / Walls", "description": "Broken fence",
    }, headers=alice).json()
    for _ in range(5):
        client.post(f"/violations/{v['id']}/escalate", headers=alice)
    res = client.post(f"/violations/{v['id']}/escalate", headers=alice)
    assert res.status_code == 400
    client.delete(f"/violations/{v['id']}", headers=alice)


def test_invalid_status_rejected(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Other", "description": "x",
    }, headers=alice).json()
    assert client.patch(f"/violations/{v['id']}", json={"status": "bogus"}, headers=alice).status_code == 400
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Repeat offense detection ----------

def test_repeat_offense_flagged(client, alice, hoa, resident):
    first = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Pet Violation", "description": "Dog off leash",
    }, headers=alice).json()
    assert first["repeat_count"] == 0

    second = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Pet Violation", "description": "Dog off leash again",
    }, headers=alice).json()
    assert second["repeat_count"] == 1
    assert second["note_count"] == 2  # open + repeat-offense system note

    letter = client.get(f"/violations/{second['id']}/letter", headers=alice).json()["letter"]
    assert "repeat violation" in letter
    client.delete(f"/violations/{first['id']}", headers=alice)
    client.delete(f"/violations/{second['id']}", headers=alice)


# ---------- Letters ----------

def test_letter_contents(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Trash / Debris", "description": "Bins left out",
    }, headers=alice).json()
    client.patch(f"/violations/{v['id']}", json={"fine_amount": 50}, headers=alice)
    letter = client.get(f"/violations/{v['id']}/letter", headers=alice).json()["letter"]
    assert "Jane Smith" in letter
    assert "Property: 101" in letter
    assert "Sunridge Estates" in letter
    assert "$50.00" in letter
    assert "Pat Boardman" in letter
    assert "board@sunridge.org" in letter
    assert "violationtrack@gmail.com" not in letter

    pdf = client.get(f"/violations/{v['id']}/letter.pdf", headers=alice)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Photo evidence ----------

def test_photo_evidence_flow(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Exterior Maintenance", "description": "Peeling paint",
    }, headers=alice).json()

    up = client.post(f"/violations/{v['id']}/photos",
                     files={"file": ("evidence.png", io.BytesIO(PNG_BYTES), "image/png")},
                     headers=alice)
    assert up.status_code == 200, up.text
    photo = up.json()
    assert photo["data"].startswith("data:image/png;base64,")

    photos = client.get(f"/violations/{v['id']}/photos", headers=alice).json()
    assert len(photos) == 1

    # Photo count is surfaced on the list endpoint
    listed = client.get(f"/violations?hoa_id={hoa['id']}", headers=alice).json()
    mine = next(x for x in listed if x["id"] == v["id"])
    assert mine["photo_count"] == 1

    # Letter references the evidence
    letter = client.get(f"/violations/{v['id']}/letter", headers=alice).json()["letter"]
    assert "Photographic evidence" in letter

    # Reject non-images
    bad = client.post(f"/violations/{v['id']}/photos",
                      files={"file": ("evil.txt", io.BytesIO(b"hello"), "text/plain")},
                      headers=alice)
    assert bad.status_code == 400

    dele = client.delete(f"/violations/{v['id']}/photos/{photo['id']}", headers=alice)
    assert dele.status_code == 200
    assert client.get(f"/violations/{v['id']}/photos", headers=alice).json() == []
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- CSV imports ----------

def test_resident_csv_import(client, alice, hoa):
    csv_data = "name,unit,email,phone\nBob Jones,202,bob@x.com,555-1\nNo Unit,,x@y.com,\nDupe,202,,\n"
    res = client.post(f"/residents/import/csv?hoa_id={hoa['id']}",
                      files={"file": ("r.csv", io.BytesIO(csv_data.encode()), "text/csv")},
                      headers=alice)
    assert res.status_code == 200
    body = res.json()
    assert body["added"] == 1
    assert len(body["errors"]) == 2  # missing unit + duplicate


def test_violation_csv_import(client, alice, hoa):
    csv_data = (
        "unit,type,description,priority,due_in_days,fine_amount\n"
        "101,Parking Violation,Truck in guest spot,high,7,25\n"
        "999,Noise Complaint,Unknown unit,,,\n"
        "202,Trash / Debris,Bins out early,invalid-priority,abc,xyz\n"
    )
    res = client.post(f"/violations/import/csv?hoa_id={hoa['id']}",
                      files={"file": ("v.csv", io.BytesIO(csv_data.encode()), "text/csv")},
                      headers=alice)
    assert res.status_code == 200
    body = res.json()
    assert body["added"] == 2                      # rows 1 and 3 (3 with defaults)
    assert len(body["errors"]) == 1 and "999" in body["errors"][0]

    listed = client.get(f"/violations?hoa_id={hoa['id']}", headers=alice).json()
    imported = [v for v in listed if v["violation_type"] in ("Parking Violation", "Trash / Debris")]
    assert any(v["fine_amount"] == 25 and v["priority"] == "high" for v in imported)
    assert any(v["priority"] == "medium" for v in imported)  # invalid priority fell back


# ---------- Analytics & activity ----------

def test_analytics_shape(client, alice, hoa):
    a = client.get(f"/hoas/{hoa['id']}/analytics", headers=alice).json()
    k = a["kpis"]
    assert k["total_violations"] >= 1
    assert 0 <= k["resolution_rate"] <= 100
    assert isinstance(a["by_type"], list) and isinstance(a["timeline"], list)
    assert len(a["timeline"]) == 6
    assert all("name" not in o or o["name"] for o in a["top_offenders"])


def test_activity_feed(client, alice, hoa):
    feed = client.get(f"/hoas/{hoa['id']}/activity", headers=alice).json()
    assert len(feed) >= 1
    entry = feed[0]
    assert {"body", "kind", "violation_type", "resident_name", "created_at"} <= set(entry.keys())


# ---------- Demo seed ----------

def test_demo_seed_requires_empty_community(client, alice, hoa):
    # hoa already has residents → refuse
    assert client.post(f"/hoas/{hoa['id']}/seed-demo", headers=alice).status_code == 400


def test_demo_seed_populates_empty_hoa(client, alice):
    new_hoa = client.post("/hoas", json={"name": "Demo Meadows", "address": "2 Demo Ln"}, headers=alice).json()
    res = client.post(f"/hoas/{new_hoa['id']}/seed-demo", headers=alice)
    assert res.status_code == 200
    body = res.json()
    assert body["residents"] == 8 and body["violations"] == 10

    residents = client.get(f"/residents?hoa_id={new_hoa['id']}", headers=alice).json()
    violations = client.get(f"/violations?hoa_id={new_hoa['id']}", headers=alice).json()
    assert len(residents) == 8 and len(violations) == 10
    assert any(v["status"] == "resolved" for v in violations)
    assert any(v["repeat_count"] == 0 for v in violations)

    a = client.get(f"/hoas/{new_hoa['id']}/analytics", headers=alice).json()
    assert a["kpis"]["total_violations"] == 10
    assert a["kpis"]["total_residents"] == 8
