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

    # Fine ledger: assess, then settle
    upd = client.post(f"/violations/{v['id']}/fines", json={"amount": 75, "kind": "assessment"}, headers=alice).json()
    assert upd["fine_amount"] == 75 and upd["fine_balance"] == 75 and upd["fine_paid"] is False
    upd = client.post(f"/violations/{v['id']}/fines", json={"amount": 75, "kind": "payment"}, headers=alice).json()
    assert upd["fine_paid"] is True and upd["fine_balance"] == 0

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
    client.post(f"/violations/{v['id']}/fines", json={"amount": 50, "kind": "assessment"}, headers=alice)
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


# ---------- Fine ledger ----------

def test_fine_ledger_partial_payments(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Commercial Vehicle", "description": "Box truck overnight",
    }, headers=alice).json()

    client.post(f"/violations/{v['id']}/fines", json={"amount": 100, "kind": "assessment", "note": "First offense"}, headers=alice)
    upd = client.post(f"/violations/{v['id']}/fines", json={"amount": 40, "kind": "payment"}, headers=alice).json()
    assert upd["fine_amount"] == 100 and upd["fine_paid_total"] == 40 and upd["fine_balance"] == 60
    assert upd["fine_paid"] is False

    # Overpayment rejected
    over = client.post(f"/violations/{v['id']}/fines", json={"amount": 500, "kind": "payment"}, headers=alice)
    assert over.status_code == 400

    # Escalating fine: second assessment stacks
    upd = client.post(f"/violations/{v['id']}/fines", json={"amount": 50, "kind": "assessment", "note": "Continued"}, headers=alice).json()
    assert upd["fine_amount"] == 150 and upd["fine_balance"] == 110

    ledger = client.get(f"/violations/{v['id']}/fines", headers=alice).json()
    assert len(ledger["entries"]) == 3
    assert ledger["assessed"] == 150 and ledger["paid"] == 40 and ledger["balance"] == 110

    # Ledger ops are rejected with bad input
    assert client.post(f"/violations/{v['id']}/fines", json={"amount": -5, "kind": "assessment"}, headers=alice).status_code == 400
    assert client.post(f"/violations/{v['id']}/fines", json={"amount": 5, "kind": "refund"}, headers=alice).status_code == 400
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Letter snapshot (audit record) ----------

def test_sent_letter_snapshot_is_immutable(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Noise Complaint", "description": "Late-night parties",
    }, headers=alice).json()

    sent_text = "EXACT LETTER AS EMAILED — proof copy"
    res = client.post(f"/violations/{v['id']}/mark-sent", json={"letter": sent_text}, headers=alice)
    assert res.status_code == 200
    assert res.json()["violation"]["letter_sent_snapshot"] is True

    # Mutate the violation after sending
    client.patch(f"/violations/{v['id']}", json={"note": "edited later"}, headers=alice)
    client.post(f"/violations/{v['id']}/fines", json={"amount": 500, "kind": "assessment"}, headers=alice)

    data = client.get(f"/violations/{v['id']}/letter", headers=alice).json()
    assert data["sent_letter"] == sent_text          # snapshot untouched
    assert data["sent_at"] is not None
    assert "$500.00" in data["letter"]                # draft reflects new data

    # Sent-version PDF serves the snapshot
    pdf = client.get(f"/violations/{v['id']}/letter.pdf?version=sent", headers=alice)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    client.delete(f"/violations/{v['id']}", headers=alice)


def test_sent_pdf_404_without_snapshot(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Other", "description": "x",
    }, headers=alice).json()
    assert client.get(f"/violations/{v['id']}/letter.pdf?version=sent", headers=alice).status_code == 404
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Archive / restore / unit uniqueness ----------

def test_duplicate_unit_rejected(client, alice, hoa, resident):
    dup = client.post("/residents", json={
        "hoa_id": hoa["id"], "name": "Copy Cat", "unit": "101",
    }, headers=alice)
    assert dup.status_code == 400
    dup2 = client.post("/residents", json={
        "hoa_id": hoa["id"], "name": "Case Cat", "unit": " 101 ",
    }, headers=alice)
    assert dup2.status_code == 400


def test_archive_preserves_history_and_restore(client, alice, hoa):
    r = client.post("/residents", json={"hoa_id": hoa["id"], "name": "Mover Out", "unit": "777"}, headers=alice).json()
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": r["id"],
        "violation_type": "Trash / Debris", "description": "history row",
    }, headers=alice).json()

    # Delete → archived, because history exists
    res = client.delete(f"/residents/{r['id']}", headers=alice).json()
    assert res["archived"] is True

    active = client.get(f"/residents?hoa_id={hoa['id']}", headers=alice).json()
    assert all(x["id"] != r["id"] for x in active)
    everyone = client.get(f"/residents?hoa_id={hoa['id']}&include_archived=true", headers=alice).json()
    archived = next(x for x in everyone if x["id"] == r["id"])
    assert archived["archived_at"] is not None

    # Violation history still resolves the resident's name
    listed = client.get(f"/violations?hoa_id={hoa['id']}", headers=alice).json()
    mine = next(x for x in listed if x["id"] == v["id"])
    assert mine["resident_name"] == "Mover Out"

    # Unit is freed for a new resident; restore then conflicts
    n = client.post("/residents", json={"hoa_id": hoa["id"], "name": "New Owner", "unit": "777"}, headers=alice)
    assert n.status_code == 200
    conflict = client.post(f"/residents/{r['id']}/restore", headers=alice)
    assert conflict.status_code == 400

    # Free the unit again and restore successfully
    client.delete(f"/residents/{n.json()['id']}", headers=alice)  # no history → hard delete
    restored = client.post(f"/residents/{r['id']}/restore", headers=alice)
    assert restored.status_code == 200 and restored.json()["archived_at"] is None
    client.delete(f"/violations/{v['id']}", headers=alice)


# ---------- Workflow logic ----------

def test_escalating_resolved_violation_reopens_it(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Fencing / Walls", "description": "again",
    }, headers=alice).json()
    client.patch(f"/violations/{v['id']}", json={"status": "resolved"}, headers=alice)
    esc = client.post(f"/violations/{v['id']}/escalate", headers=alice).json()
    assert esc["status"] == "escalated" and esc["resolved_at"] is None
    client.delete(f"/violations/{v['id']}", headers=alice)


def test_repeat_count_in_list(client, alice, hoa, resident):
    ids = []
    for i in range(2):
        v = client.post("/violations", json={
            "hoa_id": hoa["id"], "resident_id": resident["id"],
            "violation_type": "Holiday Decorations", "description": f"occurrence {i}",
        }, headers=alice).json()
        ids.append(v["id"])
    listed = client.get(f"/violations?hoa_id={hoa['id']}", headers=alice).json()
    mine = [x for x in listed if x["id"] in ids]
    assert all(x["repeat_count"] >= 1 for x in mine)
    for vid in ids:
        client.delete(f"/violations/{vid}", headers=alice)


def test_violations_pagination(client, alice, hoa):
    page = client.get(f"/violations?hoa_id={hoa['id']}&limit=1", headers=alice).json()
    assert len(page) == 1


# ---------- Password reset & rate limiting ----------

def test_password_reset_flow(client):
    register(client, "resetme@example.com", "originalpw123")
    # Forgot always responds generically (no account enumeration)
    res = client.post("/auth/forgot", json={"email": "resetme@example.com"})
    assert res.status_code == 200 and "reset link" in res.json()["message"]

    # Craft the reset token directly (SMTP is not configured in tests)
    import utils as u
    from datetime import timedelta as td
    db_user_token = None
    login = client.post("/auth/login", json={"email": "resetme@example.com", "password": "originalpw123"})
    import jwt as pyjwt
    uid = pyjwt.decode(login.json()["access_token"], u.SECRET_KEY, algorithms=[u.ALGORITHM])["sub"]
    db_user_token = u.create_access_token({"sub": uid, "purpose": "pwreset"}, td(minutes=5))

    # A normal auth token must NOT work as a reset token
    bad = client.post("/auth/reset", json={"token": login.json()["access_token"], "password": "hackedpw123"})
    assert bad.status_code == 400

    ok = client.post("/auth/reset", json={"token": db_user_token, "password": "brandnewpw123"})
    assert ok.status_code == 200
    assert client.post("/auth/login", json={"email": "resetme@example.com", "password": "originalpw123"}).status_code == 401
    assert client.post("/auth/login", json={"email": "resetme@example.com", "password": "brandnewpw123"}).status_code == 200


def test_login_rate_limited_after_repeated_failures(client):
    register(client, "bruteforce@example.com", "correctpw123")
    for _ in range(10):
        r = client.post("/auth/login", json={"email": "bruteforce@example.com", "password": "wrong"})
        assert r.status_code == 401
    locked = client.post("/auth/login", json={"email": "bruteforce@example.com", "password": "wrong"})
    assert locked.status_code == 429
    # Even the correct password is throttled while locked
    locked2 = client.post("/auth/login", json={"email": "bruteforce@example.com", "password": "correctpw123"})
    assert locked2.status_code == 429


# ---------- Resident portal ----------

def test_resident_portal_flow(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Landscaping / Lawn Care", "description": "Portal test case",
    }, headers=alice).json()
    client.post(f"/violations/{v['id']}/fines", json={"amount": 30, "kind": "assessment"}, headers=alice)

    # Manager mints the shareable link
    link = client.get(f"/violations/{v['id']}/portal-link", headers=alice).json()
    token = link["token"]
    assert token and link["expires_days"] == 90

    # Resident views the case with NO auth
    case = client.get(f"/portal/{token}").json()
    assert case["violation_type"] == "Landscaping / Lawn Care"
    assert case["resident_name"] == "Jane Smith"
    assert case["fine_assessed"] == 30 and case["fine_balance"] == 30
    assert case["hoa"]["name"] == "Sunridge Estates"

    # Resident responds — lands in the audit trail as a resident entry
    res = client.post(f"/portal/{token}/respond", json={"kind": "fixed", "message": "Mowed the lawn this morning."})
    assert res.status_code == 200
    notes = client.get(f"/violations/{v['id']}/notes", headers=alice).json()
    resident_notes = [n for n in notes if n["kind"] == "resident"]
    assert len(resident_notes) == 1
    assert "Mowed the lawn" in resident_notes[0]["body"]
    assert "corrected" in resident_notes[0]["body"]

    # Response count surfaces on the manager's list
    listed = client.get(f"/violations?hoa_id={hoa['id']}", headers=alice).json()
    mine = next(x for x in listed if x["id"] == v["id"])
    assert mine["resident_response_count"] == 1

    # Responses echo back on the portal
    case2 = client.get(f"/portal/{token}").json()
    assert len(case2["responses"]) == 1

    # Bad input rejected
    assert client.post(f"/portal/{token}/respond", json={"kind": "rant", "message": "x"}).status_code == 400
    assert client.post(f"/portal/{token}/respond", json={"kind": "question", "message": "  "}).status_code == 400
    client.delete(f"/violations/{v['id']}", headers=alice)


def test_portal_rejects_invalid_and_wrong_purpose_tokens(client, alice):
    assert client.get("/portal/not-a-token").status_code == 404
    # A normal auth token must not open the portal
    login = client.post("/auth/login", json={"email": "alice@example.com", "password": "password123"}).json()
    assert client.get(f"/portal/{login['access_token']}").status_code == 404


# ---------- Case file export ----------

def test_case_file_pdf(client, alice, hoa, resident):
    v = client.post("/violations", json={
        "hoa_id": hoa["id"], "resident_id": resident["id"],
        "violation_type": "Exterior Maintenance", "description": "Case file test",
    }, headers=alice).json()
    client.post(f"/violations/{v['id']}/fines", json={"amount": 120, "kind": "assessment", "note": "board approved"}, headers=alice)
    client.post(f"/violations/{v['id']}/notes", json={"body": "Spoke with resident on site"}, headers=alice)
    client.post(f"/violations/{v['id']}/photos",
                files={"file": ("ev.png", io.BytesIO(PNG_BYTES), "image/png")}, headers=alice)
    client.post(f"/violations/{v['id']}/mark-sent", json={"letter": "Sent letter body"}, headers=alice)

    pdf = client.get(f"/violations/{v['id']}/case-file.pdf", headers=alice)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"
    assert len(pdf.content) > 1500  # summary + timeline + letter + image pages

    # Tenant isolation holds for case files too
    bob_hdr = {"Authorization": client.post("/auth/login", json={"email": "bob@example.com", "password": "password123"}).json()["access_token"]}
    bob_hdr = {"Authorization": f"Bearer {bob_hdr['Authorization']}"}
    assert client.get(f"/violations/{v['id']}/case-file.pdf", headers=bob_hdr).status_code == 404
    client.delete(f"/violations/{v['id']}", headers=alice)


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
