from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    hoas = relationship("HOA", back_populates="user")


class HOA(Base):
    __tablename__ = "hoas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    address = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)  # a manager (user) can own many HOAs
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="hoas")
    residents = relationship("Resident", back_populates="hoa", cascade="all, delete-orphan")
    violations = relationship("Violation", back_populates="hoa", cascade="all, delete-orphan")


class Resident(Base):
    __tablename__ = "residents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    unit = Column(String)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    hoa_id = Column(Integer, ForeignKey("hoas.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    hoa = relationship("HOA", back_populates="residents")
    violations = relationship("Violation", back_populates="resident", cascade="all, delete-orphan")


class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    resident_id = Column(Integer, ForeignKey("residents.id"))
    hoa_id = Column(Integer, ForeignKey("hoas.id"))
    violation_type = Column(String, index=True)
    description = Column(Text)
    status = Column(String, default="open")

    # Compliance / enforcement workflow
    priority = Column(String, default="medium")        # low | medium | high
    notice_level = Column(Integer, default=0)          # 0=none .. 5=hearing
    due_date = Column(DateTime, nullable=True)         # cure-by deadline
    resolved_at = Column(DateTime, nullable=True)

    # Fine ledger
    fine_amount = Column(Float, default=0)
    fine_paid = Column(Boolean, default=False)

    email_sent_at = Column(DateTime, nullable=True)
    generated_letter = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    resident = relationship("Resident", back_populates="violations")
    hoa = relationship("HOA", back_populates="violations")
    notes = relationship("ViolationNote", back_populates="violation", cascade="all, delete-orphan")


class ViolationNote(Base):
    """Audit trail / activity log entry attached to a violation."""
    __tablename__ = "violation_notes"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"))
    hoa_id = Column(Integer, ForeignKey("hoas.id"))
    body = Column(Text)
    kind = Column(String, default="note")   # note | system
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="notes")
