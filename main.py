from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import jwt
import os
import re
import csv
import io
from datetime import datetime, timedelta
from database import engine, SessionLocal, Base
from models import User, HOA, Resident, Violation, ViolationNote
import utils

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HOA Violation Tracker API")

# Auth uses Bearer tokens (no cookies), so credentials aren't needed and a
# wildcard origin is safe. Set CORS_ORIGINS to lock down to your frontend URL.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOTICE_LEVELS = ["None", "Courtesy Notice", "First Notice", "Second Notice", "Final Notice", "Hearing / Legal"]
VALID_STATUSES = {"open", "noticed", "resolved", "escalated"}
VALID_PRIORITIES = {"low", "medium", "high"}


# -- Migrations (safe, idempotent) --
@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        from sqlalchemy import text
        for stmt in [
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
            # Portfolio: a manager may own many HOAs — drop the old one-HOA-per-user unique constraint
            "ALTER TABLE hoas DROP CONSTRAINT IF EXISTS hoas_user_id_key",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS email VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS phone VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS website VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS business_hours VARCHAR",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'open'",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'medium'",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS notice_level INTEGER DEFAULT 0",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS due_date TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS fine_amount DOUBLE PRECISION DEFAULT 0",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS fine_paid BOOLEAN DEFAULT FALSE",
        ]:
            try:
                db.execute(text(stmt))
                db.commit()
                print(f"✓ Migration: {stmt[:60]}")
            except Exception as e:
                db.rollback()
                print(f"✗ Migration failed: {e}")
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        db.close()


security = HTTPBearer()


class UserRegister(BaseModel):
    email: str
    password: str


class HOACreate(BaseModel):
    name: str
    address: str
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person_name: Optional[str] = None
    website: Optional[str] = None
    business_hours: Optional[str] = None


class ResidentCreate(BaseModel):
    name: str
    unit: str
    email: Optional[str] = None
    phone: Optional[str] = None
    hoa_id: Optional[int] = None


class ViolationCreate(BaseModel):
    resident_id: int
    violation_type: str
    description: str
    hoa_id: Optional[int] = None
    priority: Optional[str] = "medium"
    due_in_days: Optional[int] = 14


class ViolationUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    fine_amount: Optional[float] = None
    fine_paid: Optional[bool] = None
    due_date: Optional[str] = None
    note: Optional[str] = None


class NoteCreate(BaseModel):
    body: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(credentials.credentials, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# -- Ownership helpers (every scoped resource is verified to belong to the caller) --

def owned_hoa(hoa_id: int, user: User, db: Session) -> HOA:
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="Client (HOA) not found")
    return hoa


def owned_resident(resident_id: int, user: User, db: Session) -> Resident:
    resident = (
        db.query(Resident)
        .join(HOA, Resident.hoa_id == HOA.id)
        .filter(Resident.id == resident_id, HOA.user_id == user.id)
        .first()
    )
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    return resident


def owned_violation(violation_id: int, user: User, db: Session) -> Violation:
    violation = (
        db.query(Violation)
        .join(HOA, Violation.hoa_id == HOA.id)
        .filter(Violation.id == violation_id, HOA.user_id == user.id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    return violation


def add_system_note(db: Session, violation: Violation, body: str):
    db.add(ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=body, kind="system"))


def serialize_violation(v: Violation, resident: Optional[Resident] = None, note_count: Optional[int] = None):
    return {
        "id": v.id,
        "hoa_id": v.hoa_id,
        "resident_id": v.resident_id,
        "resident_name": resident.name if resident else None,
        "resident_unit": resident.unit if resident else None,
        "resident_email": resident.email if resident else None,
        "violation_type": v.violation_type,
        "description": v.description,
        "status": v.status,
        "priority": v.priority or "medium",
        "notice_level": v.notice_level or 0,
        "notice_label": NOTICE_LEVELS[min(v.notice_level or 0, len(NOTICE_LEVELS) - 1)],
        "fine_amount": float(v.fine_amount or 0),
        "fine_paid": bool(v.fine_paid),
        "due_date": v.due_date.isoformat() if v.due_date else None,
        "resolved_at": v.resolved_at.isoformat() if v.resolved_at else None,
        "email_sent_at": v.email_sent_at.isoformat() if v.email_sent_at else None,
        "created_at": v.created_at.isoformat(),
        "note_count": note_count,
    }


def compute_analytics(hoa: HOA, db: Session):
    violations = db.query(Violation).filter(Violation.hoa_id == hoa.id).all()
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).all()
    resident_map = {r.id: r for r in residents}
    now = datetime.utcnow()

    total = len(violations)
    resolved = [v for v in violations if v.status == "resolved"]
    overdue = [v for v in violations if v.status != "resolved" and v.due_date and v.due_date < now]

    durations = [(v.resolved_at - v.created_at).days for v in resolved if v.resolved_at and v.created_at]
    avg_days = round(sum(durations) / len(durations), 1) if durations else 0
    resolution_rate = round((len(resolved) / total) * 100) if total else 0

    def breakdown(key_fn):
        counts = {}
        for v in violations:
            k = key_fn(v)
            counts[k] = counts.get(k, 0) + 1
        return counts

    by_type = breakdown(lambda v: v.violation_type or "Other")
    by_status = breakdown(lambda v: v.status or "open")
    by_priority = breakdown(lambda v: v.priority or "medium")

    months = []
    cursor = datetime(now.year, now.month, 1)
    for _ in range(6):
        months.append(cursor)
        cursor = datetime(cursor.year - 1, 12, 1) if cursor.month == 1 else datetime(cursor.year, cursor.month - 1, 1)
    months.reverse()

    def mk(d):
        return f"{d.year}-{d.month:02d}"

    new_by_month = {mk(m): 0 for m in months}
    resolved_by_month = {mk(m): 0 for m in months}
    for v in violations:
        if v.created_at and mk(v.created_at) in new_by_month:
            new_by_month[mk(v.created_at)] += 1
        if v.resolved_at and mk(v.resolved_at) in resolved_by_month:
            resolved_by_month[mk(v.resolved_at)] += 1
    timeline = [{"month": m.strftime("%b"), "key": mk(m), "new": new_by_month[mk(m)], "resolved": resolved_by_month[mk(m)]} for m in months]

    offender_counts = {}
    for v in violations:
        offender_counts.setdefault(v.resident_id, {"total": 0, "open": 0})
        offender_counts[v.resident_id]["total"] += 1
        if v.status != "resolved":
            offender_counts[v.resident_id]["open"] += 1
    top_offenders = []
    for rid, c in offender_counts.items():
        r = resident_map.get(rid)
        if r:
            top_offenders.append({"resident_id": rid, "name": r.name, "unit": r.unit, "total": c["total"], "open": c["open"]})
    top_offenders.sort(key=lambda x: x["total"], reverse=True)
    top_offenders = top_offenders[:5]

    return {
        "kpis": {
            "total_violations": total,
            "open_violations": sum(1 for v in violations if v.status != "resolved"),
            "resolved_violations": len(resolved),
            "overdue_violations": len(overdue),
            "resolution_rate": resolution_rate,
            "avg_days_to_resolve": avg_days,
            "total_fines": round(sum(float(v.fine_amount or 0) for v in violations), 2),
            "outstanding_fines": round(sum(float(v.fine_amount or 0) for v in violations if not v.fine_paid), 2),
            "collected_fines": round(sum(float(v.fine_amount or 0) for v in violations if v.fine_paid), 2),
            "total_residents": len(residents),
        },
        "by_type": [{"label": k, "value": v} for k, v in sorted(by_type.items(), key=lambda x: x[1], reverse=True)],
        "by_status": [{"label": k, "value": v} for k, v in by_status.items()],
        "by_priority": [{"label": k, "value": v} for k, v in by_priority.items()],
        "timeline": timeline,
        "top_offenders": top_offenders,
    }


# -- Health --

@app.get("/")
def root():
    return {"message": "HOA Violation Tracker API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# -- Auth --

@app.post("/auth/register")
def register(data: UserRegister, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=email, hashed_password=utils.hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


@app.post("/auth/login")
def login(data: UserRegister, db: Session = Depends(get_db)):
    email = data.email.strip()
    user = (db.query(User).filter(User.email == email).first()
            or db.query(User).filter(func.lower(User.email) == email.lower()).first())
    if not user or not utils.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


# -- Portfolio (HOAs / clients) --

@app.get("/hoas")
def list_hoas(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoas = db.query(HOA).filter(HOA.user_id == current_user.id).order_by(HOA.name).all()
    hoa_ids = [h.id for h in hoas]
    if not hoa_ids:
        return []

    res_counts = dict(
        db.query(Resident.hoa_id, func.count(Resident.id))
        .filter(Resident.hoa_id.in_(hoa_ids)).group_by(Resident.hoa_id).all()
    )
    violations = db.query(Violation).filter(Violation.hoa_id.in_(hoa_ids)).all()
    now = datetime.utcnow()
    agg = {hid: {"total": 0, "open": 0, "overdue": 0, "fines": 0.0} for hid in hoa_ids}
    for v in violations:
        a = agg[v.hoa_id]
        a["total"] += 1
        if v.status != "resolved":
            a["open"] += 1
            if v.due_date and v.due_date < now:
                a["overdue"] += 1
        if not v.fine_paid:
            a["fines"] += float(v.fine_amount or 0)

    return [
        {
            "id": h.id, "name": h.name, "address": h.address,
            "email": getattr(h, 'email', None),
            "phone": getattr(h, 'phone', None),
            "contact_person_name": getattr(h, 'contact_person_name', None),
            "website": getattr(h, 'website', None),
            "business_hours": getattr(h, 'business_hours', None),
            "total_residents": int(res_counts.get(h.id, 0)),
            "total_violations": agg[h.id]["total"],
            "open_violations": agg[h.id]["open"],
            "overdue_violations": agg[h.id]["overdue"],
            "outstanding_fines": round(agg[h.id]["fines"], 2),
        }
        for h in hoas
    ]


@app.post("/hoas")
def create_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = HOA(name=data.name, address=data.address, user_id=current_user.id)
    # Try to set contact fields, but ignore if columns don't exist
    try:
        hoa.email = data.email
        hoa.phone = data.phone
        hoa.contact_person_name = data.contact_person_name
        hoa.website = data.website
        hoa.business_hours = data.business_hours
    except:
        pass
    db.add(hoa)
    db.commit()
    db.refresh(hoa)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', data.email),
        "phone": getattr(hoa, 'phone', data.phone),
        "contact_person_name": getattr(hoa, 'contact_person_name', data.contact_person_name),
        "website": getattr(hoa, 'website', data.website),
        "business_hours": getattr(hoa, 'business_hours', data.business_hours),
    }


# Backward-compatible alias for the old one-time setup endpoint
@app.post("/hoas/setup")
def setup_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_hoa(data, current_user, db)


@app.get("/hoas/{hoa_id}")
def get_hoa(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', None),
        "phone": getattr(hoa, 'phone', None),
        "contact_person_name": getattr(hoa, 'contact_person_name', None),
        "website": getattr(hoa, 'website', None),
        "business_hours": getattr(hoa, 'business_hours', None),
    }


@app.patch("/hoas/{hoa_id}")
def update_hoa(hoa_id: int, data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    hoa.name = data.name
    hoa.address = data.address
    # Try to save to database, but these columns might not exist yet
    try:
        hoa.email = data.email
        hoa.phone = data.phone
        hoa.contact_person_name = data.contact_person_name
        hoa.website = data.website
        hoa.business_hours = data.business_hours
    except:
        pass
    db.commit()
    db.refresh(hoa)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', data.email),
        "phone": getattr(hoa, 'phone', data.phone),
        "contact_person_name": getattr(hoa, 'contact_person_name', data.contact_person_name),
        "website": getattr(hoa, 'website', data.website),
        "business_hours": getattr(hoa, 'business_hours', data.business_hours),
    }


@app.delete("/hoas/{hoa_id}")
def delete_hoa(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    db.delete(hoa)
    db.commit()
    return {"message": "Client deleted"}


@app.get("/hoas/{hoa_id}/stats")
def get_stats(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return compute_analytics(hoa, db)["kpis"]


@app.get("/hoas/{hoa_id}/analytics")
def get_analytics(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return compute_analytics(hoa, db)


# -- Residents --

@app.post("/residents")
def add_resident(data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.hoa_id:
        raise HTTPException(status_code=400, detail="hoa_id is required")
    hoa = owned_hoa(data.hoa_id, current_user, db)
    resident = Resident(hoa_id=hoa.id, name=data.name, unit=data.unit, email=data.email or None, phone=data.phone or None)
    db.add(resident)
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email,
            "phone": resident.phone, "hoa_id": resident.hoa_id, "violation_count": 0, "open_count": 0}


@app.get("/residents")
def get_residents(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).order_by(Resident.name).all()
    total_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id).group_by(Violation.resident_id).all()
    )
    open_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id, Violation.status != "resolved").group_by(Violation.resident_id).all()
    )
    return [
        {
            "id": r.id, "name": r.name, "unit": r.unit, "email": r.email, "phone": r.phone, "hoa_id": r.hoa_id,
            "violation_count": int(total_counts.get(r.id, 0)),
            "open_count": int(open_counts.get(r.id, 0)),
        }
        for r in residents
    ]


@app.patch("/residents/{resident_id}")
def update_resident(resident_id: int, data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = owned_resident(resident_id, current_user, db)
    resident.name = data.name
    resident.unit = data.unit
    resident.email = data.email or None
    resident.phone = data.phone or None
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email, "phone": resident.phone}


@app.delete("/residents/{resident_id}")
def delete_resident(resident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = owned_resident(resident_id, current_user, db)
    db.delete(resident)
    db.commit()
    return {"message": "Resident deleted"}


@app.post("/residents/import/csv")
async def import_residents_csv(hoa_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        added = 0
        errors = []
        for idx, row in enumerate(reader, 1):
            row = {(k or "").strip().lower(): v for k, v in row.items()}
            name = (row.get("name") or "").strip()
            unit = (row.get("unit") or row.get("address") or "").strip()
            if not name or not unit:
                errors.append(f"Row {idx}: Missing required fields (name, unit/address)")
                continue
            existing = db.query(Resident).filter(Resident.hoa_id == hoa.id, Resident.unit == unit).first()
            if existing:
                errors.append(f"Row {idx}: '{unit}' already exists")
                continue
            db.add(Resident(hoa_id=hoa.id, name=name, unit=unit,
                            email=(row.get("email") or "").strip() or None,
                            phone=(row.get("phone") or "").strip() or None))
            added += 1
        db.commit()
        return {"added": added, "errors": errors, "message": f"Successfully imported {added} residents"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


# -- Violations --

@app.post("/violations")
def add_violation(data: ViolationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.hoa_id:
        raise HTTPException(status_code=400, detail="hoa_id is required")
    hoa = owned_hoa(data.hoa_id, current_user, db)
    resident = db.query(Resident).filter(Resident.id == data.resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    priority = data.priority if data.priority in VALID_PRIORITIES else "medium"
    due_days = data.due_in_days if (data.due_in_days and data.due_in_days > 0) else 14
    due_date = datetime.utcnow() + timedelta(days=due_days)

    violation = Violation(hoa_id=hoa.id, resident_id=data.resident_id, violation_type=data.violation_type,
                          description=data.description, status="open", priority=priority, due_date=due_date, notice_level=0)
    db.add(violation)
    db.commit()
    db.refresh(violation)
    add_system_note(db, violation, f"Violation opened — {due_days}-day cure period (due {due_date.strftime('%b %d, %Y')})")
    db.commit()
    return serialize_violation(violation, resident, note_count=1)


@app.get("/violations")
def get_violations(hoa_id: int, status: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    q = db.query(Violation).filter(Violation.hoa_id == hoa.id)
    if status:
        q = q.filter(Violation.status == status)
    violations = q.order_by(Violation.created_at.desc()).all()

    residents = {r.id: r for r in db.query(Resident).filter(Resident.hoa_id == hoa.id).all()}
    note_counts = dict(
        db.query(ViolationNote.violation_id, func.count(ViolationNote.id))
        .filter(ViolationNote.hoa_id == hoa.id).group_by(ViolationNote.violation_id).all()
    )
    return [serialize_violation(v, residents.get(v.resident_id), note_count=int(note_counts.get(v.id, 0))) for v in violations]


@app.get("/violations/{violation_id}/letter")
def get_violation_letter(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    hoa = db.query(HOA).filter(HOA.id == violation.hoa_id).first()
    letter = utils.generate_violation_letter(
        resident_name=resident.name,
        violation_type=violation.violation_type,
        description=violation.description,
        date=violation.created_at.strftime("%Y-%m-%d"),
        hoa_name=hoa.name if hoa else None,
        hoa_contact_person=hoa.contact_person_name if hoa else None,
        hoa_email=hoa.email if hoa else None,
        hoa_phone=hoa.phone if hoa else None,
        hoa_website=hoa.website if hoa else None,
        due_date=violation.due_date.strftime("%B %d, %Y") if violation.due_date else None,
        fine_amount=float(violation.fine_amount or 0),
        notice_label=NOTICE_LEVELS[min(violation.notice_level or 0, len(NOTICE_LEVELS) - 1)],
    )
    return {"letter": letter}


@app.get("/violations/{violation_id}/letter.pdf")
def get_violation_letter_pdf(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Printable PDF of the violation letter — for certified mail / hand delivery."""
    data = get_violation_letter(violation_id, current_user, db)
    resident = db.query(Resident).join(Violation, Violation.resident_id == Resident.id).filter(Violation.id == violation_id).first()
    pdf = utils.generate_pdf(data["letter"], resident.name if resident else "resident")
    if not pdf:
        raise HTTPException(status_code=500, detail="PDF generation failed")
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", resident.name if resident else "letter")
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="violation_notice_{safe_name}.pdf"'})


@app.patch("/violations/{violation_id}")
def update_violation(violation_id: int, data: ViolationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    fields = data.model_dump(exclude_unset=True)

    if fields.get("status") is not None:
        new_status = fields["status"]
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
        if new_status != violation.status:
            add_system_note(db, violation, f"Status changed from {violation.status} to {new_status}")
            violation.status = new_status
            violation.resolved_at = datetime.utcnow() if new_status == "resolved" else None

    if fields.get("priority") is not None:
        if fields["priority"] not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        if fields["priority"] != violation.priority:
            add_system_note(db, violation, f"Priority set to {fields['priority']}")
        violation.priority = fields["priority"]

    if fields.get("fine_amount") is not None:
        amount = max(0.0, float(fields["fine_amount"]))
        if amount != float(violation.fine_amount or 0):
            add_system_note(db, violation, f"Fine set to ${amount:,.2f}")
        violation.fine_amount = amount

    if fields.get("fine_paid") is not None:
        if bool(fields["fine_paid"]) != bool(violation.fine_paid):
            add_system_note(db, violation, "Fine marked as paid" if fields["fine_paid"] else "Fine marked as unpaid")
        violation.fine_paid = bool(fields["fine_paid"])

    if fields.get("due_date"):
        try:
            parsed = datetime.fromisoformat(fields["due_date"].replace("Z", "").split("T")[0])
            violation.due_date = parsed
            add_system_note(db, violation, f"Cure deadline updated to {parsed.strftime('%b %d, %Y')}")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid due_date format (expected YYYY-MM-DD)")

    if fields.get("note"):
        note_body = fields["note"].strip()
        if note_body:
            db.add(ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=note_body, kind="note"))

    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident)


@app.post("/violations/{violation_id}/escalate")
def escalate_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    current = violation.notice_level or 0
    if current >= len(NOTICE_LEVELS) - 1:
        raise HTTPException(status_code=400, detail="Violation is already at the highest escalation level.")
    violation.notice_level = current + 1
    violation.status = "escalated"
    add_system_note(db, violation, f"Escalated to {NOTICE_LEVELS[violation.notice_level]}")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident)


@app.get("/violations/{violation_id}/notes")
def get_violation_notes(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_violation(violation_id, current_user, db)
    notes = db.query(ViolationNote).filter(ViolationNote.violation_id == violation_id).order_by(ViolationNote.created_at.asc()).all()
    return [{"id": n.id, "body": n.body, "kind": n.kind, "created_at": n.created_at.isoformat()} for n in notes]


@app.post("/violations/{violation_id}/notes")
def add_violation_note(violation_id: int, data: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    if not data.body or not data.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")
    note = ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=data.body.strip(), kind="note")
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "body": note.body, "kind": note.kind, "created_at": note.created_at.isoformat()}


@app.delete("/violations/{violation_id}")
def delete_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    db.delete(violation)
    db.commit()
    return {"message": "Violation deleted"}


@app.post("/violations/{violation_id}/mark-sent")
def mark_violation_sent(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called by the frontend after EmailJS successfully sends the letter."""
    violation = owned_violation(violation_id, current_user, db)
    violation.email_sent_at = datetime.utcnow()
    if violation.status == "open":
        violation.status = "noticed"
    if (violation.notice_level or 0) == 0:
        violation.notice_level = 1
    add_system_note(db, violation, "Violation notice emailed to resident")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return {"email_sent_at": violation.email_sent_at.isoformat(), "violation": serialize_violation(violation, resident)}
