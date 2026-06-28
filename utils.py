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


def generate_violation_letter(resident_name: str, violation_type: str, description: str, date: str = None) -> str:
    if date is None:
        date = datetime.utcnow().strftime("%Y-%m-%d")

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
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
            logger.warning(f"Gemini letter generation failed, using fallback: {e}")

    return f"""Dear {resident_name},

Date: {date}

This letter is to notify you of a violation recorded on your property within our community.

Violation Type: {violation_type}
Description: {description}

You are required to correct this violation within fourteen (14) days of the date of this notice. Failure to remedy the violation may result in additional fines or escalated enforcement action as outlined in the HOA governing documents.

If you believe this notice was issued in error, or if you have already addressed this matter, please contact the HOA board immediately.

We appreciate your cooperation in maintaining the standards of our community.

Sincerely,

_______________________________
HOA Board President
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


def send_violation_letter_email(recipient_email: str, resident_name: str, letter_text: str, hoa_name: str) -> tuple[bool, str]:
    """Returns (success: bool, error_message: str)"""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False, "Email sending is not configured. Set the RESEND_API_KEY environment variable."

    if not recipient_email or "@" not in recipient_email:
        return False, f"Invalid email address: {recipient_email}"

    try:
        from resend import Resend
        client = Resend(api_key=api_key)
        html_body = f"""<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb;">
  <div style="max-width: 600px; margin: 40px auto; padding: 32px; background: white; border: 1px solid #e5e7eb; border-radius: 12px;">
    <div style="border-bottom: 2px solid #dc2626; padding-bottom: 16px; margin-bottom: 24px;">
      <h2 style="color: #dc2626; margin: 0; font-size: 20px;">HOA Violation Notice</h2>
      <p style="color: #6b7280; margin: 4px 0 0; font-size: 14px;">{hoa_name}</p>
    </div>
    <p style="margin-top: 0;">Dear {resident_name},</p>
    <div style="background: #f9fafb; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0;">
      <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: Georgia, serif; font-size: 14px; line-height: 1.7; margin: 0;">{letter_text}</pre>
    </div>
    <p style="color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; padding-top: 16px; margin-top: 24px;">
      This is an automated message from the {hoa_name} violation tracking system.
    </p>
  </div>
</body>
</html>"""
        response = client.emails.send({
            "from": "onboarding@resend.dev",
            "to": recipient_email,
            "subject": f"HOA Violation Notice — {hoa_name}",
            "html": html_body,
        })
        logger.info(f"Email sent to {recipient_email}: {response}")
        return True, ""
    except Exception as e:
        # Try to extract a useful message from the exception
        error_msg = ""
        # Resend SDK sometimes wraps errors; try getting the response body
        for attr in ("message", "body", "args"):
            val = getattr(e, attr, None)
            if val:
                error_msg = str(val[0]) if isinstance(val, tuple) and val else str(val)
                break
        if not error_msg:
            error_msg = str(e)

        logger.error(f"Email send failed to {recipient_email}: {type(e).__name__}: {error_msg}")

        lower = error_msg.lower()
        if "testing emails to your own" in lower or "free plan" in lower:
            return False, (
                "Resend free tier only allows sending to your own verified email address. "
                "Upgrade your Resend plan or verify the recipient's domain."
            )
        if "api key" in lower or "unauthorized" in lower or "authentication" in lower or "403" in lower or "401" in lower:
            return False, "RESEND_API_KEY is invalid or expired. Check your Resend dashboard."
        if "domain" in lower and "not" in lower:
            return False, "Sender domain not verified in Resend. Use onboarding@resend.dev for testing."

        return False, f"Failed to send email: {error_msg}"
