from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from database import Base


class ViolationStatus(str, enum.Enum):
    open = "open"
    noticed = "noticed"
    resolved = "resolved"
    escalated = "escalated"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    hoa_id = Column(Integer, ForeignKey("hoas.id"), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    hoa = relationship("HOA", back_populates="user", uselist=False)


class HOA(Base):
    __tablename__ = "hoas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    address = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="hoa", uselist=False)
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
    date = Column(DateTime, default=datetime.utcnow)
    status = Column(SAEnum(ViolationStatus), default=ViolationStatus.open)
    generated_letter = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    resident = relationship("Resident", back_populates="violations")
    hoa = relationship("HOA", back_populates="violations")