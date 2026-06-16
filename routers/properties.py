from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from auth import get_current_user, require_board_or_admin
from database import get_db
from models import User, Property, UserRole
from schemas import PropertyCreate, PropertyUpdate, PropertyResponse

router = APIRouter(prefix="/properties", tags=["Properties"])


@router.post("/", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def create_property(
    prop_in: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_board_or_admin),
):
    prop = Property(**prop_in.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    db.refresh(prop, ["owner"])
    return prop


@router.get("/", response_model=List[PropertyResponse])
def list_properties(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Property).options(joinedload(Property.owner))
    if current_user.role == UserRole.resident:
        query = query.filter(Property.owner_id == current_user.id)
    return query.offset(skip).limit(limit).all()


@router.get("/{property_id}", response_model=PropertyResponse)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = (
        db.query(Property)
        .options(joinedload(Property.owner))
        .filter(Property.id == property_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    if current_user.role == UserRole.resident and prop.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return prop


@router.patch("/{property_id}", response_model=PropertyResponse)
def update_property(
    property_id: int,
    prop_in: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_board_or_admin),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    for field, value in prop_in.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_board_or_admin),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    db.delete(prop)
    db.commit()
