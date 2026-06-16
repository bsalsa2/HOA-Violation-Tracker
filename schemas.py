from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

from models import UserRole, ViolationStatus, ViolationSeverity


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


# ── User ──────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None


class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.resident

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserResponse(UserBase):
    id: int
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Property ──────────────────────────────────────────────────────────────────

class PropertyBase(BaseModel):
    address: str
    unit_number: Optional[str] = None
    lot_number: Optional[str] = None
    square_footage: Optional[Decimal] = None
    is_rental: bool = False


class PropertyCreate(PropertyBase):
    owner_id: int


class PropertyUpdate(BaseModel):
    address: Optional[str] = None
    unit_number: Optional[str] = None
    lot_number: Optional[str] = None
    square_footage: Optional[Decimal] = None
    is_rental: Optional[bool] = None


class PropertyResponse(PropertyBase):
    id: int
    owner_id: int
    created_at: datetime
    owner: Optional[UserResponse] = None

    model_config = {"from_attributes": True}


# ── Violation ─────────────────────────────────────────────────────────────────

class ViolationBase(BaseModel):
    title: str
    description: str
    violation_type: str
    severity: ViolationSeverity = ViolationSeverity.medium
    fine_amount: Decimal = Decimal("0")
    due_date: Optional[datetime] = None


class ViolationCreate(ViolationBase):
    property_id: int
    assigned_to: Optional[int] = None


class ViolationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    violation_type: Optional[str] = None
    status: Optional[ViolationStatus] = None
    severity: Optional[ViolationSeverity] = None
    fine_amount: Optional[Decimal] = None
    fine_paid: Optional[bool] = None
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None


class ViolationImageResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ViolationNoteResponse(BaseModel):
    id: int
    violation_id: int
    author_id: int
    content: str
    is_internal: bool
    created_at: datetime
    author: Optional[UserResponse] = None

    model_config = {"from_attributes": True}


class ViolationResponse(ViolationBase):
    id: int
    property_id: int
    reported_by: int
    assigned_to: Optional[int] = None
    status: ViolationStatus
    fine_paid: bool
    ai_analysis: Optional[str] = None
    ai_suggested_severity: Optional[str] = None
    ai_suggested_fine: Optional[Decimal] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    property: Optional[PropertyResponse] = None
    reported_by_user: Optional[UserResponse] = None
    assigned_to_user: Optional[UserResponse] = None
    notes: List[ViolationNoteResponse] = []
    images: List[ViolationImageResponse] = []

    model_config = {"from_attributes": True}


class ViolationListResponse(BaseModel):
    id: int
    title: str
    violation_type: str
    status: ViolationStatus
    severity: ViolationSeverity
    fine_amount: Decimal
    fine_paid: bool
    property_id: int
    reported_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Note ──────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    content: str
    is_internal: bool = False


# ── AI Analysis ───────────────────────────────────────────────────────────────

class AIAnalysisRequest(BaseModel):
    violation_description: str
    violation_type: str
    property_address: Optional[str] = None


class AIAnalysisResponse(BaseModel):
    analysis: str
    suggested_severity: ViolationSeverity
    suggested_fine: Decimal
    recommended_actions: List[str]


# ── Dashboard / Stats ─────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_violations: int
    open_violations: int
    resolved_violations: int
    dismissed_violations: int
    under_review_violations: int
    total_fines_issued: Decimal
    total_fines_collected: Decimal
    violations_by_type: dict
    violations_by_severity: dict
