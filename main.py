from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
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

@app.post("/hoas")
def create_hoa(hoa_data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = HOA(name=hoa_data.name, address=hoa_data.address, user_id=current_user.id)
    db.add(hoa)
    db.commit()
    db.refresh(hoa)
    return {"id": hoa.id, "name": hoa.name, "address": hoa.address}

@app.get("/hoas")
def get_hoas(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoas = db.query(HOA).filter(HOA.user_id == current_user.id).all()
    return [{"id": h.id, "name": h.name, "address": h.address} for h in hoas]

@app.post("/residents/{hoa_id}")
def add_resident(hoa_id: int, resident_data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == current_user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")
    resident = Resident(hoa_id=hoa_id, name=resident_data.name, unit=resident_data.unit, email=resident_data.email, phone=resident_data.phone)
    db.add(resident)
    db.commit()
    db.refresh(resident)
    return {"id": resident.id, "name": resident.name, "unit": resident.unit, "email": resident.email}

@app.get("/residents/{hoa_id}")
def get_residents(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == current_user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")
    residents = db.query(Resident).filter(Resident.hoa_id == hoa_id).all()
    return [{"id": r.id, "name": r.name, "unit": r.unit, "email": r.email} for r in residents]

@app.post("/violations/{hoa_id}")
def add_violation(hoa_id: int, violation_data: ViolationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == current_user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")
    violation = Violation(hoa_id=hoa_id, resident_id=violation_data.resident_id, violation_type=violation_data.violation_type, description=violation_data.description, status="open")
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return {"id": violation.id, "violation_type": violation.violation_type, "status": violation.status}

@app.get("/violations/{hoa_id}")
def get_violations(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == current_user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")
    violations = db.query(Violation).filter(Violation.hoa_id == hoa_id).all()
    return [{"id": v.id, "violation_type": v.violation_type, "description": v.description, "status": v.status} for v in violations]

@app.get("/violations/{violation_id}/letter")
def get_violation_letter(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    letter = utils.generate_violation_letter(resident.name, violation.violation_type, violation.description, violation.created_at.strftime("%Y-%m-%d"))
    return {"letter": letter}

@app.patch("/violations/{violation_id}")
def update_violation(violation_id: int, violation_data: ViolationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    violation.status = violation_data.status
    db.commit()
    return {"id": violation.id, "status": violation.status}