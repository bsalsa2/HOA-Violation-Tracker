from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
import jwt
import os
import csv
import io
from datetime import datetime
from database import engine, SessionLocal, Base
from models import User, HOA, Resident, Violation
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
    email: str = None
    phone: str = None


class ViolationCreate(BaseModel):
    resident_id: int
    violation_type: str
    description: str


class ViolationUpdate(BaseModel):
    status: str


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
def setup_hoa(
    data: HOACreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
def update_my_hoa(
    data: HOACreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    q = db.query(Violation).filter(Violation.hoa_id == hoa.id)
    total = q.count()
    return {
        "total_residents": total_residents,
        "total_violations": total,
        "open_violations": q.filter(Violation.status == "open").count(),
        "noticed_violations": q.filter(Violation.status == "noticed").count(),
        "resolved_violations": q.filter(Violation.status == "resolved").count(),
        "escalated_violations": q.filter(Violation.status == "escalated").count(),
    }


# -- Residents --

@app.post("/residents")
def add_resident(
    data: ResidentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email, "phone": resident.phone}


@app.get("/residents")
def get_residents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = get_user_hoa(current_user, db)
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).order_by(Resident.name).all()
    return [{"id": r.id, "name": r.name, "unit": r.unit, "email": r.email, "phone": r.phone} for r in residents]


@app.patch("/residents/{resident_id}")
def update_resident(
    resident_id: int,
    data: ResidentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
def delete_resident(
    resident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    resident = db.query(Resident).filter(Resident.id == resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    db.delete(resident)
    db.commit()
    return {"message": "Resident deleted"}


@app.post("/residents/import/csv")
async def import_residents_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        added = 0
        errors = []
        for idx, row in enumerate(reader, 1):
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
def add_violation(
    data: ViolationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    resident = db.query(Resident).filter(Resident.id == data.resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    violation = Violation(
        hoa_id=hoa.id,
        resident_id=data.resident_id,
        violation_type=data.violation_type,
        description=data.description,
        status="open",
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return {
        "id": violation.id,
        "resident_id": violation.resident_id,
        "violation_type": violation.violation_type,
        "description": violation.description,
        "status": violation.status,
        "created_at": violation.created_at.isoformat(),
        "email_sent_at": None,
    }


@app.get("/violations")
def get_violations(
    status: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    q = db.query(Violation).filter(Violation.hoa_id == hoa.id)
    if status:
        q = q.filter(Violation.status == status)
    violations = q.order_by(Violation.created_at.desc()).all()
    return [
        {
            "id": v.id,
            "resident_id": v.resident_id,
            "violation_type": v.violation_type,
            "description": v.description,
            "status": v.status,
            "created_at": v.created_at.isoformat(),
            "email_sent_at": v.email_sent_at.isoformat() if v.email_sent_at else None,
        }
        for v in violations
    ]


@app.get("/violations/{violation_id}/letter")
def get_violation_letter(
    violation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    letter = utils.generate_violation_letter(
        resident.name,
        violation.violation_type,
        violation.description,
        violation.created_at.strftime("%Y-%m-%d"),
    )
    return {"letter": letter}


@app.patch("/violations/{violation_id}")
def update_violation(
    violation_id: int,
    data: ViolationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    valid_statuses = {"open", "noticed", "resolved", "escalated"}
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    violation.status = data.status
    db.commit()
    return {"id": violation.id, "status": violation.status}


@app.delete("/violations/{violation_id}")
def delete_violation(
    violation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    db.delete(violation)
    db.commit()
    return {"message": "Violation deleted"}


@app.post("/violations/{violation_id}/mark-sent")
def mark_violation_sent(
    violation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called by the frontend after EmailJS successfully sends the letter."""
    hoa = get_user_hoa(current_user, db)
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == hoa.id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    violation.email_sent_at = datetime.utcnow()
    violation.status = "noticed"
    db.commit()
    return {"email_sent_at": violation.email_sent_at.isoformat()}
