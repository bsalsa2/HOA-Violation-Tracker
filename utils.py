import jwt
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_violation_letter(resident_name: str, violation_type: str, description: str) -> str:
    return f"""Dear {resident_name},

This is to inform you of a violation on your property:

Violation Type: {violation_type}
Description: {description}

Please correct this violation within 14 days.

Sincerely,
HOA Board"""