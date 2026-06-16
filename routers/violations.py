import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, require_board_or_admin
from database import get_db
from models import (
    User, Property, Violation, ViolationNote, ViolationImage,
    UserRole, ViolationStatus
)
from schemas import (
    ViolationCreate, ViolationUpdate, ViolationResponse, ViolationListResponse,
    NoteCreate, ViolationNoteResponse, ViolationImageResponse
)

UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

router = APIRouter(prefix="/violations", tags=["Violations"])


def _get_violation_or_404(violation_id: int, db: Session) -> Violation:
    v = (
        db.query(Violation)
        .options(
            joinedload(Violation.property).joinedload(Property.owner),
            joinedload(Violation.reported_by_user),
            joinedload(Violation.assigned_to_user),
            joinedload(Violation.notes).joinedload(ViolationNote.author),
            joinedload(Violation.images),
        )
        .filter(Violation.id == violation_id)
        .first()
    )
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    return v


def _assert_access(violation: Violation, current_user: User):
    if current_user.role == UserRole.resident:
        if violation.property.owner_id != current_user.id and violation.reported_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.post("/", response_model=ViolationResponse, status_code=status.HTTP_201_CREATED)
def create_violation(
    violation_in: ViolationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(Property.id == violation_in.property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    violation = Violation(
        **violation_in.model_dump(),
        reported_by=current_user.id,
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return _get_violation_or_404(violation.id, db)


@router.get("/", response_model=List[ViolationListResponse])
def list_violations(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[ViolationStatus] = Query(None, alias="status"),
    property_id: Optional[int] = None,
    assigned_to: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Violation)

    if current_user.role == UserRole.resident:
        owned_property_ids = (
            db.query(Property.id).filter(Property.owner_id == current_user.id).subquery()
        )
        query = query.filter(
            (Violation.property_id.in_(owned_property_ids)) |
            (Violation.reported_by == current_user.id)
        )

    if status_filter:
        query = query.filter(Violation.status == status_filter)
    if property_id:
        query = query.filter(Violation.property_id == property_id)
    if assigned_to:
        query = query.filter(Violation.assigned_to == assigned_to)

    return query.order_by(Violation.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{violation_id}", response_model=ViolationResponse)
def get_violation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violation = _get_violation_or_404(violation_id, db)
    _assert_access(violation, current_user)
    return violation


@router.patch("/{violation_id}", response_model=ViolationResponse)
def update_violation(
    violation_id: int,
    violation_in: ViolationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violation = _get_violation_or_404(violation_id, db)
    _assert_access(violation, current_user)

    if current_user.role == UserRole.resident:
        # Residents may only update description, not status or fines
        allowed = {"description"}
        data = {k: v for k, v in violation_in.model_dump(exclude_none=True).items() if k in allowed}
    else:
        data = violation_in.model_dump(exclude_none=True)

    if "status" in data and data["status"] == ViolationStatus.resolved:
        data["resolved_at"] = datetime.now(timezone.utc)

    plain_violation = db.query(Violation).filter(Violation.id == violation_id).first()
    for field, value in data.items():
        setattr(plain_violation, field, value)

    db.commit()
    return _get_violation_or_404(violation_id, db)


@router.delete("/{violation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_violation(
    violation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_board_or_admin),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    db.delete(violation)
    db.commit()


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.post("/{violation_id}/notes", response_model=ViolationNoteResponse, status_code=status.HTTP_201_CREATED)
def add_note(
    violation_id: int,
    note_in: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violation = _get_violation_or_404(violation_id, db)
    _assert_access(violation, current_user)

    # Residents cannot post internal notes
    is_internal = note_in.is_internal and current_user.role != UserRole.resident

    note = ViolationNote(
        violation_id=violation_id,
        author_id=current_user.id,
        content=note_in.content,
        is_internal=is_internal,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    db.refresh(note, ["author"])
    return note


@router.delete("/{violation_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    violation_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(ViolationNote).filter(
        ViolationNote.id == note_id,
        ViolationNote.violation_id == violation_id,
    ).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if note.author_id != current_user.id and current_user.role not in (UserRole.admin, UserRole.board_member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    db.delete(note)
    db.commit()


# ── Images ────────────────────────────────────────────────────────────────────

@router.post("/{violation_id}/images", response_model=ViolationImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    violation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violation = _get_violation_or_404(violation_id, db)
    _assert_access(violation, current_user)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 10 MB",
        )

    unique_filename = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(UPLOAD_DIR, unique_filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(contents)

    image = ViolationImage(
        violation_id=violation_id,
        filename=unique_filename,
        original_filename=file.filename or unique_filename,
        file_path=save_path,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.delete("/{violation_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    violation_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_board_or_admin),
):
    image = db.query(ViolationImage).filter(
        ViolationImage.id == image_id,
        ViolationImage.violation_id == violation_id,
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    if os.path.exists(image.file_path):
        os.remove(image.file_path)
    db.delete(image)
    db.commit()
