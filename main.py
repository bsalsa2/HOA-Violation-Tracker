from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import jwt
import os
from datetime import datetime, timedelta
from database import engine, SessionLocal, Base
from models import User, HOA, Resident, Violation
import utils

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ Database tables created successfully")
    except Exception as e:
        print(f"⚠ Database initialization warning: {e}")
        # Don't fail startup - tables might already exist

security = HTTPBearer()

class UserRegister(BaseModel):
    email: str
    password: str = Field(...)

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

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY", "your-secret-key"), algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/")
def health_check():
    return {"message": "HOA Violation Tracker API", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/auth/register")
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    try:
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        hashed = utils.hash_password(user_data.password)
        user = User(email=user_data.email, hashed_password=hashed)
        db.add(user)
        db.commit()
        db.refresh(user)
        token = utils.create_access_token({"sub": str(user.id)})
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/login")
def login(user_data: UserRegister, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.email == user_data.email).first()
        if not user or not utils.verify_password(user_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = utils.create_access_token({"sub": str(user.id)})
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/hoas/setup")
def setup_hoa(hoa_data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.hoa_id:
        raise HTTPException(status_code=400, detail="HOA already set up")
    hoa = HOA(name=hoa_data.name, address=hoa_data.address)
    db.add(hoa)
    db.flush()
    current_user.hoa_id = hoa.id
    db.commit()
    db.refresh(hoa)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}

@app.get("/hoas/me")
def get_my_hoa(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    hoa = db.query(HOA).filter(HOA.id == current_user.hoa_id).first()
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}

@app.patch("/hoas/me")
def update_my_hoa(hoa_data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    hoa = db.query(HOA).filter(HOA.id == current_user.hoa_id).first()
    hoa.name = hoa_data.name
    hoa.address = hoa_data.address
    db.commit()
    db.refresh(hoa)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}

@app.get("/hoas/me/stats")
def get_hoa_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    total_residents = db.query(Resident).filter(Resident.hoa_id == current_user.hoa_id).count()
    total_violations = db.query(Violation).filter(Violation.hoa_id == current_user.hoa_id).count()
    open_violations = db.query(Violation).filter(Violation.hoa_id == current_user.hoa_id, Violation.status == "open").count()
    noticed_violations = db.query(Violation).filter(Violation.hoa_id == current_user.hoa_id, Violation.status == "noticed").count()
    resolved_violations = db.query(Violation).filter(Violation.hoa_id == current_user.hoa_id, Violation.status == "resolved").count()
    return {
        "total_residents": total_residents,
        "total_violations": total_violations,
        "open_violations": open_violations,
        "noticed_violations": noticed_violations,
        "resolved_violations": resolved_violations
    }

@app.post("/residents")
def add_resident(resident_data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    resident = Resident(hoa_id=current_user.hoa_id, name=resident_data.name, unit=resident_data.unit, email=resident_data.email, phone=resident_data.phone)
    db.add(resident)
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email, "phone": resident.phone}

@app.get("/residents")
def get_residents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    residents = db.query(Resident).filter(Resident.hoa_id == current_user.hoa_id).all()
    return [{"id": r.id, "name": r.name, "unit": r.unit, "email": r.email, "phone": r.phone} for r in residents]

@app.delete("/residents/{resident_id}")
def delete_resident(resident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = db.query(Resident).filter(Resident.id == resident_id, Resident.hoa_id == current_user.hoa_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    db.delete(resident)
    db.commit()
    return {"message": "Resident deleted"}

@app.patch("/residents/{resident_id}")
def update_resident(resident_id: int, resident_data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = db.query(Resident).filter(Resident.id == resident_id, Resident.hoa_id == current_user.hoa_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    resident.name = resident_data.name
    resident.unit = resident_data.unit
    resident.email = resident_data.email
    resident.phone = resident_data.phone
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email, "phone": resident.phone}

@app.post("/violations")
def add_violation(violation_data: ViolationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    violation = Violation(hoa_id=current_user.hoa_id, resident_id=violation_data.resident_id, violation_type=violation_data.violation_type, description=violation_data.description, status="open")
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return {"id": violation.id, "violation_type": violation.violation_type, "status": violation.status}

@app.get("/violations")
def get_violations(status: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.hoa_id:
        raise HTTPException(status_code=404, detail="HOA not set up yet")
    query = db.query(Violation).filter(Violation.hoa_id == current_user.hoa_id)
    if status:
        query = query.filter(Violation.status == status)
    violations = query.all()
    return [{"id": v.id, "resident_id": v.resident_id, "violation_type": v.violation_type, "description": v.description, "status": v.status, "created_at": v.created_at.isoformat()} for v in violations]

@app.get("/violations/{violation_id}/letter")
def get_violation_letter(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == current_user.hoa_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    letter = utils.generate_violation_letter(resident.name, violation.violation_type, violation.description, violation.created_at.strftime("%Y-%m-%d"))
    return {"letter": letter}

@app.patch("/violations/{violation_id}")
def update_violation(violation_id: int, violation_data: ViolationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == current_user.hoa_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    violation.status = violation_data.status
    db.commit()
    return {"id": violation.id, "status": violation.status}

@app.delete("/violations/{violation_id}")
def delete_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id, Violation.hoa_id == current_user.hoa_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    db.delete(violation)
    db.commit()
    return {"message": "Violation deleted"}