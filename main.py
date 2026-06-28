from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import jwt
import os
import csv
import io
from datetime import datetime, timedelta
from database import engine, SessionLocal, Base
from models import User, HOA, Resident, Violation, ViolationNote
import utils

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HOA Violation Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
            except Exception:
                db.rollback()
    except Exception as e:
        print(f"Migration warning: {e}")
    finally:
        db.close()


security = HTTPBearer()


class UserRegister(BaseModel):
    email: str
    password: str


class HOACreate(BaseModel):
    name: str
    address: str


class ResidentCreate(BaseModel):
    name: str
    unit: str
    email: Optional[str] = None
    phone: Optional[str] = None


class ViolationCreate(BaseModel):
    resident_id: int
    violation_type: str
    description: str
    priority: Optional[str] = "medium"
    due_in_days: Optional[int] = 14


class ViolationUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    fine_amount: Optional[float] = None
    fine_paid: Optional[bool] = None
    due_date: Optional[str] = None


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
        payload = jwt.decode(
            credentials.credentials,
            os.getenv("SECRET_KEY", "change-me-in-production-use-32-chars-minimum"),
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_hoa(current_user: User, db: Session) -> HOA:
    hoa = db.query(HOA).filter(HOA.user_id == current_user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    return hoa


def add_system_note(db: Session, violation: Violation, body: str):
    db.add(ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=body, kind="system"))


def serialize_violation(v: Violation, resident: Optional[Resident] = None, note_count: Optional[int] = None):
    return {
        "id": v.id,
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
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=data.email, hashed_password=utils.hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


@app.post("/auth/login")
def login(data: UserRegister, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not utils.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


# -- HOA --

@app.post("/hoas/setup")
def setup_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(HOA).filter(HOA.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="HOA already set up")
    hoa = HOA(name=data.name, address=data.address, user_id=current_user.id)
    db.add(hoa)
    db.commit()
    db.refresh(hoa)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}


@app.get("/hoas/me")
def get_my_hoa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}


@app.patch("/hoas/me")
def update_my_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    hoa.name = data.name
    hoa.address = data.address
    db.commit()
    db.refresh(hoa)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}


@app.get("/hoas/me/stats")
def get_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    total_residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).count()
    violations = db.query(Violation).filter(Violation.hoa_id == hoa.id).all()
    now = datetime.utcnow()

    open_count = sum(1 for v in violations if v.status == "open")
    noticed_count = sum(1 for v in violations if v.status == "noticed")
    resolved_count = sum(1 for v in violations if v.status == "resolved")
    escalated_count = sum(1 for v in violations if v.status == "escalated")
    overdue_count = sum(
        1 for v in violations
        if v.status != "resolved" and v.due_date and v.due_date < now
    )
    outstanding_fines = sum(float(v.fine_amount or 0) for v in violations if not v.fine_paid)

    return {
        "total_residents": total_residents,
        "total_violations": len(violations),
        "open_violations": open_count,
        "noticed_violations": noticed_count,
        "resolved_violations": resolved_count,
        "escalated_violations": escalated_count,
        "overdue_violations": overdue_count,
        "outstanding_fines": round(outstanding_fines, 2),
    }


@app.get("/hoas/me/analytics")
def get_analytics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violations = db.query(Violation).filter(Violation.hoa_id == hoa.id).all()
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).all()
    resident_map = {r.id: r for r in residents}
    now = datetime.utcnow()

    total = len(violations)
    resolved = [v for v in violations if v.status == "resolved"]
    overdue = [v for v in violations if v.status != "resolved" and v.due_date and v.due_date < now]

    # Average days to resolve
    durations = [
        (v.resolved_at - v.created_at).days
        for v in resolved
        if v.resolved_at and v.created_at
    ]
    avg_days = round(sum(durations) / len(durations), 1) if durations else 0
    resolution_rate = round((len(resolved) / total) * 100) if total else 0

    # Breakdowns
    def breakdown(key_fn):
        counts = {}
        for v in violations:
            k = key_fn(v)
            counts[k] = counts.get(k, 0) + 1
        return counts

    by_type = breakdown(lambda v: v.violation_type or "Other")
    by_status = breakdown(lambda v: v.status or "open")
    by_priority = breakdown(lambda v: v.priority or "medium")

    # 6-month timeline (new vs resolved)
    months = []
    cursor = datetime(now.year, now.month, 1)
    for _ in range(6):
        months.append(cursor)
        # step back one month
        if cursor.month == 1:
            cursor = datetime(cursor.year - 1, 12, 1)
        else:
            cursor = datetime(cursor.year, cursor.month - 1, 1)
    months.reverse()

    def month_key(d):
        return f"{d.year}-{d.month:02d}"

    timeline = []
    month_keys = [month_key(m) for m in months]
    new_by_month = {k: 0 for k in month_keys}
    resolved_by_month = {k: 0 for k in month_keys}
    for v in violations:
        if v.created_at:
            k = month_key(v.created_at)
            if k in new_by_month:
                new_by_month[k] += 1
        if v.resolved_at:
            k = month_key(v.resolved_at)
            if k in resolved_by_month:
                resolved_by_month[k] += 1
    for m in months:
        k = month_key(m)
        timeline.append({
            "month": m.strftime("%b"),
            "key": k,
            "new": new_by_month[k],
            "resolved": resolved_by_month[k],
        })

    # Top offenders
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
            top_offenders.append({
                "resident_id": rid,
                "name": r.name,
                "unit": r.unit,
                "total": c["total"],
                "open": c["open"],
            })
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


# -- Residents --

@app.post("/residents")
def add_resident(data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    resident = Resident(
        hoa_id=hoa.id,
        name=data.name,
        unit=data.unit,
        email=data.email or None,
        phone=data.phone or None,
    )
    db.add(resident)
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit,
            "email": resident.email, "phone": resident.phone,
            "violation_count": 0, "open_count": 0}


@app.get("/residents")
def get_residents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).order_by(Resident.name).all()

    # Per-resident violation counts (single grouped query each)
    total_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id)
        .group_by(Violation.resident_id)
        .all()
    )
    open_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id, Violation.status != "resolved")
        .group_by(Violation.resident_id)
        .all()
    )
    return [
        {
            "id": r.id, "name": r.name, "unit": r.unit, "email": r.email, "phone": r.phone,
            "violation_count": int(total_counts.get(r.id, 0)),
            "open_count": int(open_counts.get(r.id, 0)),
        }
        for r in residents
    ]


@app.patch("/residents/{resident_id}")
def update_resident(resident_id: int, data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    resident = db.query(Resident).filter(Resident.id == resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    resident.name = data.name
    resident.unit = data.unit
    resident.email = data.email or None
    resident.phone = data.phone or None
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email, "phone": resident.phone}


@app.delete("/residents/{resident_id}")
def delete_resident(resident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    resident = db.query(Resident).filter(Resident.id == resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    db.delete(resident)
    db.commit()
    return {"message": "Resident deleted"}


@app.post("/residents/import/csv")
async def import_residents_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        added = 0
        errors = []
        for idx, row in enumerate(reader, 1):
            row = {(k or "").strip().lower(): v for k, v in row.items()}
            name = (row.get("name") or "").strip()
            unit = (row.get("unit") or "").strip()
            if not name or not unit:
                errors.append(f"Row {idx}: Missing required fields (name, unit)")
                continue
            existing = db.query(Resident).filter(Resident.hoa_id == hoa.id, Resident.unit == unit).first()
            if existing:
                errors.append(f"Row {idx}: Unit {unit} already exists")
                continue
            resident = Resident(
                hoa_id=hoa.id,
                name=name,
                unit=unit,
                email=(row.get("email") or "").strip() or None,
                phone=(row.get("phone") or "").strip() or None,
            )
            db.add(resident)
            added += 1
        db.commit()
        return {"added": added, "errors": errors, "message": f"Successfully imported {added} residents"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


# -- Violations --

@app.post("/violations")
def add_violation(data: ViolationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    resident = db.query(Resident).filter(Resident.id == data.resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    priority = data.priority if data.priority in VALID_PRIORITIES else "medium"
    due_days = data.due_in_days if (data.due_in_days and data.due_in_days > 0) else 14
    due_date = datetime.utcnow() + timedelta(days=due_days)

    violation = Violation(
        hoa_id=hoa.id,
        resident_id=data.resident_id,
        violation_type=data.violation_type,
        description=data.description,
        status="open",
        priority=priority,
        due_date=due_date,
        notice_level=0,
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    add_system_note(db, violation, f"Violation opened — {due_days}-day cure period (due {due_date.strftime('%b %d, %Y')})")
    db.commit()
    return serialize_violation(violation, resident, note_count=1)


@app.get("/violations")
def get_violations(status: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    q = db.query(Violation).filter(Violation.hoa_id == hoa.id)
    if status:
        q = q.filter(Violation.status == status)
    violations = q.order_by(Violation.created_at.desc()).all()

    residents = {r.id: r for r in db.query(Resident).filter(Resident.hoa_id == hoa.id).all()}
    note_counts = dict(
        db.query(ViolationNote.violation_id, func.count(ViolationNote.id))
        .filter(ViolationNote.hoa_id == hoa.id)
        .group_by(ViolationNote.violation_id)
        .all()
    )
    return [
        serialize_violation(v, residents.get(v.resident_id), note_count=int(note_counts.get(v.id, 0)))
        for v in violations
    ]


@app.get("/violations/{violation_id}/letter")
def get_violation_letter(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    letter = utils.generate_violation_letter(
        resident_name=resident.name,
        violation_type=violation.violation_type,
        description=violation.description,
        date=violation.created_at.strftime("%Y-%m-%d"),
        hoa_name=hoa.name,
        due_date=violation.due_date.strftime("%B %d, %Y") if violation.due_date else None,
        fine_amount=float(violation.fine_amount or 0),
        notice_label=NOTICE_LEVELS[min(violation.notice_level or 0, len(NOTICE_LEVELS) - 1)],
    )
    return {"letter": letter}


@app.patch("/violations/{violation_id}")
def update_violation(violation_id: int, data: ViolationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    fields = data.model_dump(exclude_unset=True)

    if "status" in fields and fields["status"] is not None:
        new_status = fields["status"]
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
        if new_status != violation.status:
            add_system_note(db, violation, f"Status changed from {violation.status} to {new_status}")
            violation.status = new_status
            if new_status == "resolved":
                violation.resolved_at = datetime.utcnow()
            else:
                violation.resolved_at = None

    if "priority" in fields and fields["priority"] is not None:
        if fields["priority"] not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        if fields["priority"] != violation.priority:
            add_system_note(db, violation, f"Priority set to {fields['priority']}")
        violation.priority = fields["priority"]

    if "fine_amount" in fields and fields["fine_amount"] is not None:
        amount = max(0.0, float(fields["fine_amount"]))
        if amount != float(violation.fine_amount or 0):
            add_system_note(db, violation, f"Fine set to ${amount:,.2f}")
        violation.fine_amount = amount

    if "fine_paid" in fields and fields["fine_paid"] is not None:
        if bool(fields["fine_paid"]) != bool(violation.fine_paid):
            add_system_note(db, violation, "Fine marked as paid" if fields["fine_paid"] else "Fine marked as unpaid")
        violation.fine_paid = bool(fields["fine_paid"])

    if "due_date" in fields and fields["due_date"]:
        try:
            parsed = datetime.fromisoformat(fields["due_date"].replace("Z", "").split("T")[0])
            violation.due_date = parsed
            add_system_note(db, violation, f"Cure deadline updated to {parsed.strftime('%b %d, %Y')}")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid due_date format (expected YYYY-MM-DD)")

    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident)


@app.post("/violations/{violation_id}/escalate")
def escalate_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    current = violation.notice_level or 0
    if current >= len(NOTICE_LEVELS) - 1:
        raise HTTPException(status_code=400, detail="Violation is already at the highest escalation level.")

    violation.notice_level = current + 1
    violation.status = "escalated"
    label = NOTICE_LEVELS[violation.notice_level]
    add_system_note(db, violation, f"Escalated to {label}")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident)


@app.get("/violations/{violation_id}/notes")
def get_violation_notes(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    notes = db.query(ViolationNote).filter(ViolationNote.violation_id == violation_id).order_by(ViolationNote.created_at.asc()).all()
    return [
        {"id": n.id, "body": n.body, "kind": n.kind, "created_at": n.created_at.isoformat()}
        for n in notes
    ]


@app.post("/violations/{violation_id}/notes")
def add_violation_note(violation_id: int, data: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    if not data.body or not data.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")
    note = ViolationNote(violation_id=violation_id, hoa_id=hoa.id, body=data.body.strip(), kind="note")
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "body": note.body, "kind": note.kind, "created_at": note.created_at.isoformat()}


@app.delete("/violations/{violation_id}")
def delete_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    db.delete(violation)
    db.commit()
    return {"message": "Violation deleted"}


@app.post("/violations/{violation_id}/mark-sent")
def mark_violation_sent(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called by the frontend after EmailJS successfully sends the letter."""
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    violation.email_sent_at = datetime.utcnow()
    if violation.status == "open":
        violation.status = "noticed"
    if (violation.notice_level or 0) == 0:
        violation.notice_level = 1
    add_system_note(db, violation, "Violation notice emailed to resident")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return {
        "email_sent_at": violation.email_sent_at.isoformat(),
        "violation": serialize_violation(violation, resident),
    }
