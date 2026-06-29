import jwt
import os
import logging
from datetime import datetime, timedelta
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-32-chars-minimum")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte input limit; truncate to avoid silent truncation bugs
    if len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if len(plain_password.encode("utf-8")) > 72:
        plain_password = plain_password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=24))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def generate_violation_letter(
    resident_name: str,
    violation_type: str,
    description: str,
    date: str = None,
    hoa_name: str = None,
    hoa_contact_person: str = None,
    hoa_email: str = None,
    hoa_phone: str = None,
    hoa_website: str = None,
    due_date: str = None,
    fine_amount: float = 0,
    notice_label: str = None,
) -> str:
    if date is None:
        date = datetime.utcnow().strftime("%Y-%m-%d")

    org = hoa_name or "the Homeowners Association"
    cure_clause = (
        f"You are required to correct this violation by {due_date}."
        if due_date else
        "You are required to correct this violation within fourteen (14) days of the date of this notice."
    )
    fine_clause = (
        f"\n\nA fine of ${fine_amount:,.2f} has been assessed in connection with this violation."
        if fine_amount and fine_amount > 0 else ""
    )
    notice_clause = (
        f"This is a {notice_label}."
        if notice_label and notice_label not in ("None",) else ""
    )

    contact_block = ""
    if hoa_contact_person or hoa_email or hoa_phone or hoa_website:
        contact_lines = []
        if hoa_contact_person:
            contact_lines.append(hoa_contact_person)
        if hoa_email:
            contact_lines.append(f"Email: {hoa_email}")
        if hoa_phone:
            contact_lines.append(f"Phone: {hoa_phone}")
        if hoa_website:
            contact_lines.append(f"Website: {hoa_website}")
        contact_block = "\n" + "\n".join(contact_lines)

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-pro")
            prompt = f"""Generate a professional HOA violation notice letter.

Association: {org}
Resident: {resident_name}
Violation Type: {violation_type}
Description: {description}
Date: {date}
Cure deadline: {due_date or '14 days from notice date'}
Notice level: {notice_label or 'First Notice'}
Fine assessed: {f'${fine_amount:,.2f}' if fine_amount and fine_amount > 0 else 'None'}

The letter should:
- Be formal and professional, on behalf of {org}
- Clearly state the violation and the specific cure deadline
- Reference the fine if one was assessed
- Explain that failure to cure may result in additional fines or escalation
- Be approximately 160-220 words
- Include a signature line for the HOA board president

Generate ONLY the letter text, no additional commentary."""
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.warning(f"Gemini letter generation failed, using fallback: {e}")

    return f"""Dear {resident_name},

Date: {date}

{notice_clause}

This letter is to notify you, on behalf of {org}, of a violation recorded on your property within our community.

Violation Type: {violation_type}
Description: {description}

{cure_clause} Failure to remedy the violation may result in additional fines or escalated enforcement action as outlined in the HOA governing documents.{fine_clause}

If you believe this notice was issued in error, or if you have already addressed this matter, please contact the HOA board immediately.

We appreciate your cooperation in maintaining the standards of our community.

Sincerely,

_______________________________
HOA Board President
{org}{contact_block}
"""


def generate_pdf(letter_text: str, resident_name: str):
    try:
        from io import BytesIO
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas as rl_canvas

        pdf_buffer = BytesIO()
        c = rl_canvas.Canvas(pdf_buffer, pagesize=letter)
        width, height = letter
        c.setFont("Helvetica", 12)
        y = height - 60
        for line in letter_text.split("\n"):
            if y < 60:
                c.showPage()
                y = height - 60
            c.drawString(60, y, line)
            y -= 18
        c.save()
        pdf_buffer.seek(0)
        return pdf_buffer
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None
