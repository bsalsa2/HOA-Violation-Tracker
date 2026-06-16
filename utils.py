from passlib.context import CryptContext
import jwt
from jwt.exceptions import InvalidTokenError
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


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=7))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, os.getenv("JWT_SECRET"), algorithm="HS256")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def generate_violation_letter(
    resident_name: str,
    violation_type: str,
    description: str,
    date: str,
) -> str:
    """Generate a professional violation letter using Gemini API."""
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
    """Convert letter text to a PDF and return it as a BytesIO buffer."""
    pdf_buffer = BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=letter)
    width, height = letter

    c.setFont("Helvetica", 12)
    y = height - 40

    for line in letter_text.split("\n"):
        if y < 40:
            c.showPage()
            c.setFont("Helvetica", 12)
            y = height - 40
        c.drawString(40, y, line)
        y -= 15

    c.save()
    pdf_buffer.seek(0)
    return pdf_buffer
