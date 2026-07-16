from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)  # admin can see/manage all HOAs
    created_at = Column(DateTime, default=datetime.utcnow)

    hoas = relationship("HOA", back_populates="user")


class InviteCode(Base):
    """A single-use signup code. The operator mints one for each paying
    customer and sends them a link containing it; registration requires a
    valid, unused code so accounts can't be created without paying."""
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    label = Column(String, nullable=True)              # e.g. the customer's name, for the operator's reference
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class HOA(Base):
    __tablename__ = "hoas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    address = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)  # a manager (user) can own many HOAs
    created_at = Column(DateTime, default=datetime.utcnow)

    # HOA contact information
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    contact_person_name = Column(String, nullable=True)
    website = Column(String, nullable=True)
    business_hours = Column(String, nullable=True)  # e.g. "Mon-Fri 9am-5pm PST"

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
    # Soft delete: residents with enforcement history are archived, never
    # erased — boards need records after a move-out.
    archived_at = Column(DateTime, nullable=True)

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
    photos = relationship("ViolationPhoto", back_populates="violation", cascade="all, delete-orphan")
    fines = relationship("ViolationFine", back_populates="violation", cascade="all, delete-orphan")


class ViolationNote(Base):
    """Audit trail / activity log entry attached to a violation."""
    __tablename__ = "violation_notes"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), index=True)
    hoa_id = Column(Integer, ForeignKey("hoas.id"), index=True)
    body = Column(Text)
    kind = Column(String, default="note")   # note | system
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="notes")


class ViolationFine(Base):
    """Fine ledger entry — an assessment or a payment against a violation.

    Real HOAs assess escalating fines and receive partial payments; a single
    amount + paid flag can't represent that. The violation's legacy
    fine_amount/fine_paid columns remain as a read fallback for rows created
    before the ledger existed.
    """
    __tablename__ = "violation_fines"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), index=True)
    hoa_id = Column(Integer, ForeignKey("hoas.id"), index=True)
    amount = Column(Float)                   # always positive
    kind = Column(String, default="assessment")   # assessment | payment
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="fines")


class ViolationPhoto(Base):
    """Photo evidence attached to a violation, stored inline as a data URL.

    Inline storage keeps deployment to a single Postgres instance (no object
    store); uploads are capped small at the API layer, which is plenty for
    inspection snapshots.
    """
    __tablename__ = "violation_photos"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), index=True)
    hoa_id = Column(Integer, ForeignKey("hoas.id"), index=True)
    data = Column(Text)                      # data:image/...;base64,....
    caption = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="photos")
