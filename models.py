from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean,
    ForeignKey, Enum as SAEnum, Numeric
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    board_member = "board_member"
    resident = "resident"


class ViolationStatus(str, enum.Enum):
    open = "open"
    under_review = "under_review"
    resolved = "resolved"
    dismissed = "dismissed"


class ViolationSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.resident, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    phone = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    properties = relationship("Property", back_populates="owner")
    violations_reported = relationship(
        "Violation", back_populates="reported_by_user",
        foreign_keys="Violation.reported_by"
    )
    violations_assigned = relationship(
        "Violation", back_populates="assigned_to_user",
        foreign_keys="Violation.assigned_to"
    )
    notes = relationship("ViolationNote", back_populates="author")


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String(500), nullable=False)
    unit_number = Column(String(50))
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lot_number = Column(String(50))
    square_footage = Column(Numeric(10, 2))
    is_rental = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="properties")
    violations = relationship("Violation", back_populates="property")


class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"))

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    violation_type = Column(String(100), nullable=False)
    status = Column(SAEnum(ViolationStatus), default=ViolationStatus.open, nullable=False)
    severity = Column(SAEnum(ViolationSeverity), default=ViolationSeverity.medium, nullable=False)

    fine_amount = Column(Numeric(10, 2), default=0)
    fine_paid = Column(Boolean, default=False)

    ai_analysis = Column(Text)
    ai_suggested_severity = Column(String(50))
    ai_suggested_fine = Column(Numeric(10, 2))

    due_date = Column(DateTime(timezone=True))
    resolved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    property = relationship("Property", back_populates="violations")
    reported_by_user = relationship(
        "User", back_populates="violations_reported",
        foreign_keys=[reported_by]
    )
    assigned_to_user = relationship(
        "User", back_populates="violations_assigned",
        foreign_keys=[assigned_to]
    )
    notes = relationship("ViolationNote", back_populates="violation", cascade="all, delete-orphan")
    images = relationship("ViolationImage", back_populates="violation", cascade="all, delete-orphan")


class ViolationNote(Base):
    __tablename__ = "violation_notes"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    violation = relationship("Violation", back_populates="notes")
    author = relationship("User", back_populates="notes")


class ViolationImage(Base):
    __tablename__ = "violation_images"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    violation = relationship("Violation", back_populates="images")
