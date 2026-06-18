from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserRegister(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class HOACreate(BaseModel):
    name: str
    address: str


class HOAResponse(BaseModel):
    id: int
    name: str
    address: str
    created_at: datetime

    class Config:
        orm_mode = True


class ResidentCreate(BaseModel):
    name: str
    unit: str
    email: Optional[str] = None
    phone: Optional[str] = None


class ResidentResponse(BaseModel):
    id: int
    name: str
    unit: str
    email: Optional[str]
    phone: Optional[str]
    hoa_id: int
    created_at: datetime

    class Config:
        orm_mode = True


class ViolationCreate(BaseModel):
    resident_id: int
    violation_type: str
    description: str


class ViolationUpdate(BaseModel):
    status: str


class ViolationResponse(BaseModel):
    id: int
    resident_id: int
    hoa_id: int
    violation_type: str
    description: str
    date: datetime
    status: str
    generated_letter: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True