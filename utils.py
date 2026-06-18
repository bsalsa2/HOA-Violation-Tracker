import jwt
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
import google.generativeai as genai
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

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

def generate_violation_letter(resident_name: str, violation_type: str, description: str, date: str = None) -> str:
    if date is None:
        date = datetime.utcnow().strftime("%Y-%m-%d")
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
        return f"""Dear {resident_name},

This is to inform you of a violation on your property:

Violation Type: {violation_type}
Description: {description}

Please correct this violation within 14 days.

Sincerely,
HOA Board"""

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