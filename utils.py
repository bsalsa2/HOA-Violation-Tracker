from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import google.generativeai as genai
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, os.getenv("JWT_SECRET"), algorithm="HS256")
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_violation_letter(resident_name: str, violation_type: str, description: str, date: str) -> str:
    try:
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel("gemini-pro")
        prompt = f"""Generate a professional HOA violation notice letter.

Resident: {resident_name}
Violation Type: {violation_type}
Description: {description}
Date: {date}

The letter should:
- Be formal and professional
- Clearly state the violation
- Give 14 days to cure the violation
- Be approximately 150-200 words
- Include a signature line for HOA board president

Generate ONLY the letter text, no additional commentary."""
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Unable to generate letter. Error: {str(e)}"

def generate_pdf(letter_text: str, resident_name: str) -> BytesIO:
    pdf_buffer = BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=letter)
    width, height = letter
    c.setFont("Helvetica", 12)
    y = height - 40
    lines = letter_text.split("\n")
    for line in lines:
        if y < 40:
            c.showPage()
            y = height - 40
        c.drawString(40, y, line)
        y -= 15
    c.save()
    pdf_buffer.seek(0)
    return pdf_buffer