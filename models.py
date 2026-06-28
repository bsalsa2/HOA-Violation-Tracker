from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
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
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
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
    email_sent_at = Column(DateTime, nullable=True)
    generated_letter = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    resident = relationship("Resident", back_populates="violations")
    hoa = relationship("HOA", back_populates="violations")
