import jwt
import os
import logging
from datetime import datetime, timedelta
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# Accept either name — deploy configs historically used JWT_SECRET while the
# code read SECRET_KEY, which silently fell back to the default. Never again.
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET") or "change-me-in-production-use-32-chars-minimum"
if SECRET_KEY == "change-me-in-production-use-32-chars-minimum" and os.getenv("ENVIRONMENT", "development") != "development":
    logger.warning("SECRET_KEY is not set — JWTs are signed with the built-in default. Set SECRET_KEY in the environment.")
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


def send_email(to: str, subject: str, body: str, reply_to: str = None, from_name: str = None):
    """Deliver a plain-text email through whichever provider is configured.

    Preference order:
      1. Brevo HTTP API (BREVO_API_KEY) — sends over HTTPS, so it works on hosts
         that block outbound SMTP ports (Render/Railway free tiers do).
      2. Raw SMTP (SMTP_HOST) — for self-hosted or paid tiers where SMTP is open.

    `from_name` sets the sender display name (we pass the HOA's name so notices
    read as coming from that HOA) and `reply_to` routes replies (the HOA's own
    address). The envelope From is always the one verified sender we control.

    Raises LookupError when no provider is configured, so callers can degrade
    gracefully (return 501 for notices, silently skip password-reset mail)."""
    if os.getenv("BREVO_API_KEY"):
        return _send_email_brevo(to, subject, body, reply_to, from_name)
    if os.getenv("SMTP_HOST"):
        return send_email_smtp(to, subject, body, reply_to, from_name)
    raise LookupError("No email provider configured (set BREVO_API_KEY or SMTP_HOST)")


def _send_email_brevo(to: str, subject: str, body: str, reply_to: str = None, from_name: str = None):
    """Send via Brevo's transactional email API over HTTPS. Requires a verified
    sender (BREVO_SENDER_EMAIL) — on Brevo's free tier that's just an email you
    confirm by clicking a link, no domain purchase needed."""
    import json
    import urllib.request
    import urllib.error

    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL") or os.getenv("SMTP_FROM")
    if not sender_email:
        raise LookupError("BREVO_SENDER_EMAIL (or SMTP_FROM) is not configured")
    sender_name = from_name or os.getenv("BREVO_SENDER_NAME") or "ViolationTrack"

    payload = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": body,
    }
    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "api-key": api_key,
            "content-type": "application/json",
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Brevo API error {e.code}: {detail}") from e


def send_email_smtp(to: str, subject: str, body: str, reply_to: str = None, from_name: str = None):
    """Send plain-text mail through the SMTP server configured in the
    environment. Raises LookupError when SMTP is not configured so callers
    can fall back to client-side delivery."""
    host = os.getenv("SMTP_HOST")
    if not host:
        raise LookupError("SMTP_HOST is not configured")
    import smtplib
    from email.message import EmailMessage
    from email.utils import formataddr

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    from_addr = os.getenv("SMTP_FROM") or user
    if not from_addr:
        raise LookupError("SMTP_FROM (or SMTP_USER) is not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr)) if from_name else from_addr
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)

    use_ssl = os.getenv("SMTP_SSL", "").lower() in ("1", "true", "yes")
    smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_cls(host, port, timeout=20) as server:
        if not use_ssl and os.getenv("SMTP_STARTTLS", "true").lower() not in ("0", "false", "no"):
            server.starttls()
        if user and password:
            server.login(user, password)
        server.send_message(msg)


def generate_violation_letter(
    resident_name: str,
    violation_type: str,
    description: str,
    date: str = None,
    property_address: str = None,
    hoa_name: str = None,
    hoa_contact_person: str = None,
    hoa_email: str = None,
    hoa_phone: str = None,
    hoa_website: str = None,
    due_date: str = None,
    fine_amount: float = 0,
    notice_label: str = None,
    repeat_count: int = 0,
    photo_count: int = 0,
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
    property_line = f"\nProperty: {property_address}" if property_address else ""
    repeat_clause = (
        "\n\nPlease note that our records indicate this is a repeat violation of the same nature within the past twelve months. Continued non-compliance may result in accelerated enforcement action."
        if repeat_count and repeat_count > 0 else ""
    )
    evidence_clause = (
        f" Photographic evidence ({photo_count} photo{'s' if photo_count != 1 else ''}) is on file with the association."
        if photo_count and photo_count > 0 else ""
    )

    contact_block = ""
    if hoa_email or hoa_phone or hoa_website:
        contact_lines = []
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
            model = genai.GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-2.0-flash"))
            prompt = f"""Generate a professional HOA violation notice letter.

Association: {org}
Resident: {resident_name}
Property: {property_address or 'on file'}
Violation Type: {violation_type}
Description: {description}
Date: {date}
Cure deadline: {due_date or '14 days from notice date'}
Notice level: {notice_label or 'First Notice'}
Fine assessed: {f'${fine_amount:,.2f}' if fine_amount and fine_amount > 0 else 'None'}
Repeat offense: {'Yes — same violation type within the past 12 months' if repeat_count else 'No'}
Photo evidence on file: {photo_count or 0}

The letter should:
- Be formal and professional, on behalf of {org}
- Reference the property address and clearly state the violation and the specific cure deadline
- Reference the fine if one was assessed, and mention photo evidence if any is on file
- If this is a repeat offense, note that records show a prior violation of the same nature
- Explain that failure to cure may result in additional fines or escalation
- Be approximately 160-220 words
- Include a signature line for {hoa_contact_person or 'the HOA board president'}

Generate ONLY the letter text, no additional commentary."""
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.warning(f"Gemini letter generation failed, using fallback: {e}")

    return f"""Dear {resident_name},

Date: {date}{property_line}

{notice_clause}

This letter is to notify you, on behalf of {org}, of a violation recorded on your property within our community.

Violation Type: {violation_type}
Description: {description}{evidence_clause}

{cure_clause} Failure to remedy the violation may result in additional fines or escalated enforcement action as outlined in the HOA governing documents.{fine_clause}{repeat_clause}

If you believe this notice was issued in error, or if you have already addressed this matter, please contact {org} immediately.

We appreciate your cooperation in maintaining the standards of our community.

Sincerely,

_______________________________
{hoa_contact_person or 'Board of Directors'}
{org}{contact_block}
"""


def generate_case_file_pdf(case: dict):
    """Hearing-ready case file: summary, fine ledger, full audit timeline,
    the as-sent letter, and embedded photo evidence — one PDF for the board
    packet or the association's attorney.

    `case` keys: hoa_name, case_id, resident_name, property, violation_type,
    description, status, notice_label, priority, created_at, due_date,
    resolved_at, fine (assessed/paid/balance), ledger [(date, kind, amount, note)],
    timeline [(date, kind, body)], sent_letter, sent_at, photos [data_url].
    """
    try:
        import base64 as b64
        import textwrap
        from io import BytesIO
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas as rl_canvas

        buf = BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=letter)
        width, height = letter
        margin = 54
        y = height - margin

        def ensure(space):
            nonlocal y
            if y - space < margin:
                c.showPage()
                y = height - margin

        def heading(text, size=13):
            nonlocal y
            ensure(30)
            c.setFont("Helvetica-Bold", size)
            c.drawString(margin, y, text)
            y -= 6
            c.setLineWidth(0.5)
            c.line(margin, y, width - margin, y)
            y -= 14

        def line(text, font="Helvetica", size=10, indent=0, gap=13):
            nonlocal y
            for chunk in textwrap.wrap(text, width=100 - indent // 4) or [""]:
                ensure(gap + 4)
                c.setFont(font, size)
                c.drawString(margin + indent, y, chunk)
                y -= gap

        def field(label, value):
            nonlocal y
            ensure(15)
            c.setFont("Helvetica-Bold", 10)
            c.drawString(margin, y, f"{label}:")
            c.setFont("Helvetica", 10)
            c.drawString(margin + 110, y, str(value if value not in (None, "") else "—"))
            y -= 14

        # Header
        c.setFont("Helvetica-Bold", 16)
        c.drawString(margin, y, f"Violation Case File — #{case.get('case_id')}")
        y -= 18
        c.setFont("Helvetica", 10)
        c.drawString(margin, y, f"{case.get('hoa_name', 'Homeowners Association')} · Generated {datetime.utcnow().strftime('%B %d, %Y')}")
        y -= 26

        heading("Case Summary")
        field("Resident", case.get("resident_name"))
        field("Property", case.get("property"))
        field("Violation Type", case.get("violation_type"))
        field("Status", (case.get("status") or "").capitalize())
        field("Notice Level", case.get("notice_label"))
        field("Priority", (case.get("priority") or "").capitalize())
        field("Opened", case.get("created_at"))
        field("Cure Deadline", case.get("due_date"))
        field("Resolved", case.get("resolved_at"))
        y -= 4
        line("Description:", font="Helvetica-Bold")
        line(case.get("description") or "—", indent=10)
        y -= 8

        fine = case.get("fine") or {}
        heading("Fine Ledger")
        field("Total Assessed", f"${fine.get('assessed', 0):,.2f}")
        field("Total Paid", f"${fine.get('paid', 0):,.2f}")
        field("Balance Due", f"${fine.get('balance', 0):,.2f}")
        for date, kind, amount, note in case.get("ledger", []):
            line(f"{date}  ·  {kind.capitalize():<11}  ${amount:,.2f}" + (f"  —  {note}" if note else ""), indent=10, size=9, gap=12)
        y -= 8

        heading("Case Timeline (complete audit record)")
        for date, kind, body in case.get("timeline", []):
            tag = {"system": "SYSTEM", "resident": "RESIDENT", "note": "MANAGER"}.get(kind, kind.upper())
            line(f"{date}  [{tag}]", font="Helvetica-Bold", size=9, gap=12)
            line(body, indent=14, size=9, gap=12)
            y -= 2
        y -= 8

        if case.get("sent_letter"):
            c.showPage()
            y = height - margin
            heading(f"Official Notice — as sent {case.get('sent_at') or ''}")
            for paragraph in case["sent_letter"].split("\n"):
                line(paragraph, size=9.5, gap=12)

        photos = case.get("photos") or []
        if photos:
            c.showPage()
            y = height - margin
            heading(f"Photo Evidence ({len(photos)})")
            for i, data_url in enumerate(photos, 1):
                try:
                    raw = b64.b64decode(data_url.split(",", 1)[1])
                    img = ImageReader(BytesIO(raw))
                    iw, ih = img.getSize()
                    max_w, max_h = width - 2 * margin, 300
                    scale = min(max_w / iw, max_h / ih, 1.0)
                    w, h = iw * scale, ih * scale
                    ensure(h + 26)
                    c.drawImage(img, margin, y - h, width=w, height=h, preserveAspectRatio=True, anchor='nw')
                    y -= h + 6
                    line(f"Exhibit {i}", font="Helvetica-Bold", size=9, gap=16)
                except Exception as photo_err:
                    line(f"Exhibit {i}: could not render image ({photo_err})", size=9)

        c.save()
        buf.seek(0)
        return buf
    except Exception as e:
        logger.error(f"Case file PDF generation failed: {e}")
        return None


def generate_pdf(letter_text: str, resident_name: str):
    """Render a violation letter as a printable US-letter PDF (for certified mail)."""
    try:
        import textwrap
        from io import BytesIO
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas as rl_canvas

        pdf_buffer = BytesIO()
        c = rl_canvas.Canvas(pdf_buffer, pagesize=letter)
        width, height = letter
        margin = 72  # 1" margins, standard business letter
        c.setFont("Times-Roman", 11)
        y = height - margin
        for paragraph in letter_text.split("\n"):
            lines = textwrap.wrap(paragraph, width=92) or [""]
            for line in lines:
                if y < margin:
                    c.showPage()
                    c.setFont("Times-Roman", 11)
                    y = height - margin
                c.drawString(margin, y, line)
                y -= 15
        c.save()
        pdf_buffer.seek(0)
        return pdf_buffer
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None
