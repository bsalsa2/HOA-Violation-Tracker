from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
from dotenv import load_dotenv

from database import engine, get_db, Base
from models import User, HOA, Resident, Violation, ViolationStatus
from schemas import (
    UserRegister, UserLogin, Token,
    HOACreate, HOAResponse,
    ResidentCreate, ResidentResponse,
    ViolationCreate, ViolationUpdate, ViolationResponse,
)
from utils import (
    hash_password, verify_password,
    create_access_token, verify_token,
    generate_violation_letter, generate_pdf,
)

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HOA Violation Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== AUTH =====

@app.post("/auth/register", response_model=Token)
def register(user: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    db_user = User(email=user.email, hashed_password=hash_password(user.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return {"access_token": create_access_token({"sub": user.email}), "token_type": "bearer"}


@app.post("/auth/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": create_access_token({"sub": user.email}), "token_type": "bearer"}


# ===== HOAs =====

@app.post("/hoas", response_model=HOAResponse)
def create_hoa(hoa: HOACreate, email: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    db_hoa = HOA(name=hoa.name, address=hoa.address, user_id=user.id)
    db.add(db_hoa)
    db.commit()
    db.refresh(db_hoa)
    return db_hoa


@app.get("/hoas", response_model=list[HOAResponse])
def get_hoas(email: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user.hoas


# ===== RESIDENTS =====

@app.post("/residents/{hoa_id}", response_model=ResidentResponse)
def create_resident(
    hoa_id: int,
    resident: ResidentCreate,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email).first()
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")

    db_resident = Resident(
        name=resident.name,
        unit=resident.unit,
        email=resident.email,
        phone=resident.phone,
        hoa_id=hoa_id,
    )
    db.add(db_resident)
    db.commit()
    db.refresh(db_resident)
    return db_resident


@app.get("/residents/{hoa_id}", response_model=list[ResidentResponse])
def get_residents(hoa_id: int, email: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")

    return hoa.residents


# ===== VIOLATIONS =====
# NOTE: specific literal-segment routes must be registered before /{hoa_id}
# to avoid the literal "detail" or "export-pdf" being captured as an integer param.

@app.get("/violations/detail/{violation_id}", response_model=ViolationResponse)
def get_violation_detail(
    violation_id: int,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    return violation


@app.post("/violations/{hoa_id}", response_model=ViolationResponse)
def create_violation(
    hoa_id: int,
    violation: ViolationCreate,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email).first()
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")

    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    letter_text = generate_violation_letter(
        resident.name,
        violation.violation_type,
        violation.description,
        datetime.utcnow().strftime("%Y-%m-%d"),
    )

    db_violation = Violation(
        resident_id=violation.resident_id,
        hoa_id=hoa_id,
        violation_type=violation.violation_type,
        description=violation.description,
        generated_letter=letter_text,
    )
    db.add(db_violation)
    db.commit()
    db.refresh(db_violation)
    return db_violation


@app.get("/violations/{hoa_id}", response_model=list[ViolationResponse])
def get_violations(hoa_id: int, email: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    hoa = db.query(HOA).filter(HOA.id == hoa_id, HOA.user_id == user.id).first()
    if not hoa:
        raise HTTPException(status_code=404, detail="HOA not found")

    return db.query(Violation).filter(Violation.hoa_id == hoa_id).all()


@app.get("/violations/{violation_id}/letter")
def get_violation_letter(
    violation_id: int,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    return {"letter": violation.generated_letter}


@app.post("/violations/{violation_id}/export-pdf")
def export_violation_pdf(
    violation_id: int,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    if not violation.generated_letter:
        raise HTTPException(status_code=400, detail="No letter generated for this violation")

    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    pdf_buffer = generate_pdf(violation.generated_letter, resident.name)
    filename = f"{resident.name.replace(' ', '_')}_violation_{violation_id}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.patch("/violations/{violation_id}", response_model=ViolationResponse)
def update_violation(
    violation_id: int,
    update: ViolationUpdate,
    email: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    try:
        violation.status = ViolationStatus(update.status)
    except ValueError:
        valid = [s.value for s in ViolationStatus]
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {valid}")

    db.commit()
    db.refresh(violation)
    return violation


@app.get("/")
def root():
    return {"message": "HOA Violation Tracker API", "status": "running"}
