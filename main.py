from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import jwt
import os
import re
import csv
import io
from datetime import datetime, timedelta
import base64
import random
import secrets
import time
from collections import defaultdict, deque
from database import engine, SessionLocal, Base
from models import User, HOA, Resident, Violation, ViolationNote, ViolationPhoto, ViolationFine, InviteCode
import utils

app = FastAPI(title="HOA Violation Tracker API")

# Auth uses Bearer tokens (no cookies), so credentials aren't needed and a
# wildcard origin is safe. Set CORS_ORIGINS to lock down to your frontend URL.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOTICE_LEVELS = ["None", "Courtesy Notice", "First Notice", "Second Notice", "Final Notice", "Hearing / Legal"]
VALID_STATUSES = {"open", "noticed", "resolved", "escalated"}
VALID_PRIORITIES = {"low", "medium", "high"}

# The operator account. This email bootstraps as admin and can register without
# an invite code (everyone else is invite-only). Overridable via env for testing.
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "violationtrack.notices@gmail.com").strip().lower()


# -- Schema setup (safe, idempotent, runs once per process) --
#
# On serverless (Vercel) this must NOT run at import time: every cold start
# would then do a full create_all reflection plus 17 ALTERs against the DB
# before handling the request, which inflates cold-start latency enough to time
# out slow calls (e.g. sending a notice email). Instead we run it lazily on the
# first request and guard it with a flag so it's a no-op afterward. A request
# middleware triggers it because Vercel's runtime does not reliably fire ASGI
# lifespan ("startup") events.
_schema_ready = False


def ensure_schema():
    global _schema_ready
    if _schema_ready:
        return
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"create_all skipped: {str(e)[:100]}")

    db = SessionLocal()
    try:
        from sqlalchemy import text

        is_sqlite = "sqlite" in str(db.get_bind().url)
        pg_stmts = [
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
            "ALTER TABLE hoas DROP CONSTRAINT IF EXISTS hoas_user_id_key",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS email VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS phone VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS website VARCHAR",
            "ALTER TABLE hoas ADD COLUMN IF NOT EXISTS business_hours VARCHAR",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'open'",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'medium'",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS notice_level INTEGER DEFAULT 0",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS due_date TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS fine_amount DOUBLE PRECISION DEFAULT 0",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS fine_paid BOOLEAN DEFAULT FALSE",
            "ALTER TABLE residents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE",
        ]
        if not is_sqlite:
            for stmt in pg_stmts:
                try:
                    db.execute(text(stmt))
                    db.commit()
                except Exception as e:
                    db.rollback()
                    print(f"⚠ Skipped: {str(e)[:80]}")
        print("✓ Database initialized")
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        db.close()

    _schema_ready = True


@app.middleware("http")
async def _schema_guard(request, call_next):
    ensure_schema()
    return await call_next(request)


@app.on_event("startup")
def startup():
    # Fires under uvicorn/TestClient (local + tests). On Vercel the middleware
    # above is what actually triggers schema setup.
    ensure_schema()


security = HTTPBearer()


# -- Login rate limiting (in-memory; per-process) --

_login_failures = defaultdict(deque)
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 900  # 15 minutes


def check_login_rate(key: str):
    dq = _login_failures[key]
    now = time.time()
    while dq and now - dq[0] > RATE_LIMIT_WINDOW:
        dq.popleft()
    if len(dq) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in a few minutes.")


def record_login_failure(key: str):
    _login_failures[key].append(time.time())


def end_of_day(dt: datetime) -> datetime:
    """Cure deadlines are end-of-day dates, not instants — a notice that says
    'correct by July 15' should not flip overdue at midnight UTC the night before."""
    return dt.replace(hour=23, minute=59, second=59, microsecond=0)


# -- Resident portal tokens --
# A notice can carry a secure link that lets the resident view their case and
# respond — no account needed. Tokens are purpose-scoped and violation-scoped.

PORTAL_TOKEN_DAYS = 90


def create_portal_token(violation_id: int) -> str:
    return utils.create_access_token({"vid": violation_id, "purpose": "portal"}, timedelta(days=PORTAL_TOKEN_DAYS))


def portal_violation(token: str, db: Session) -> Violation:
    try:
        payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        if payload.get("purpose") != "portal":
            raise jwt.InvalidTokenError()
        vid = int(payload.get("vid"))
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=404, detail="This link is invalid or has expired")
    violation = db.query(Violation).filter(Violation.id == vid).first()
    if not violation:
        raise HTTPException(status_code=404, detail="This link is invalid or has expired")
    return violation


class UserRegister(BaseModel):
    email: str
    password: str
    invite_code: Optional[str] = None
    hoa_name: Optional[str] = None  # for invite signup flow
    hoa_address: Optional[str] = None


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class InviteCreate(BaseModel):
    label: Optional[str] = None


class HOACreate(BaseModel):
    name: str
    address: str
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person_name: Optional[str] = None
    website: Optional[str] = None
    business_hours: Optional[str] = None


class ResidentCreate(BaseModel):
    name: str
    unit: str
    email: Optional[str] = None
    phone: Optional[str] = None
    hoa_id: Optional[int] = None


class ViolationCreate(BaseModel):
    resident_id: int
    violation_type: str
    description: str
    hoa_id: Optional[int] = None
    priority: Optional[str] = "medium"
    due_in_days: Optional[int] = 14


class ViolationUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    note: Optional[str] = None


class FineCreate(BaseModel):
    amount: float
    kind: str  # assessment | payment
    note: Optional[str] = None


class MarkSentBody(BaseModel):
    # The exact letter text that was emailed (AI letters are nondeterministic,
    # so the server can't reproduce it after the fact)
    letter: Optional[str] = None


class NoteCreate(BaseModel):
    body: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(credentials.credentials, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# -- Ownership helpers (every scoped resource is verified to belong to the caller) --

def owned_hoa(hoa_id: int, user: User, db: Session) -> HOA:
    hoa = db.query(HOA).filter(HOA.id == hoa_id).first()
    if not hoa or (not user.is_admin and hoa.user_id != user.id):
        raise HTTPException(status_code=404, detail="Client (HOA) not found")
    return hoa


def owned_resident(resident_id: int, user: User, db: Session) -> Resident:
    resident = (
        db.query(Resident)
        .join(HOA, Resident.hoa_id == HOA.id)
        .filter(Resident.id == resident_id, HOA.user_id == user.id)
        .first()
    )
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    return resident


def owned_violation(violation_id: int, user: User, db: Session) -> Violation:
    query = (
        db.query(Violation)
        .join(HOA, Violation.hoa_id == HOA.id)
        .filter(Violation.id == violation_id)
    )
    if not user.is_admin:
        query = query.filter(HOA.user_id == user.id)
    violation = query.first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    return violation


def add_system_note(db: Session, violation: Violation, body: str):
    db.add(ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=body, kind="system"))


def fine_totals(db: Session, v: Violation):
    """(assessed, paid) from the ledger, falling back to the pre-ledger columns."""
    rows = db.query(ViolationFine.kind, func.sum(ViolationFine.amount)).filter(
        ViolationFine.violation_id == v.id).group_by(ViolationFine.kind).all()
    if rows:
        sums = {k: float(s or 0) for k, s in rows}
        return sums.get("assessment", 0.0), sums.get("payment", 0.0)
    legacy = float(v.fine_amount or 0)
    return legacy, (legacy if v.fine_paid else 0.0)


def fine_totals_batch(db: Session, hoa_id: int):
    """violation_id -> (assessed, paid) for every ledgered violation in an HOA."""
    rows = db.query(ViolationFine.violation_id, ViolationFine.kind, func.sum(ViolationFine.amount)).filter(
        ViolationFine.hoa_id == hoa_id).group_by(ViolationFine.violation_id, ViolationFine.kind).all()
    out = {}
    for vid, kind, total in rows:
        a, p = out.get(vid, (0.0, 0.0))
        if kind == "assessment":
            a += float(total or 0)
        else:
            p += float(total or 0)
        out[vid] = (a, p)
    return out


def migrate_legacy_fine(db: Session, v: Violation):
    """Move a pre-ledger fine into the ledger before the first ledger operation."""
    if float(v.fine_amount or 0) <= 0:
        return
    has_rows = db.query(func.count(ViolationFine.id)).filter(ViolationFine.violation_id == v.id).scalar()
    if has_rows:
        return
    amount = float(v.fine_amount)
    db.add(ViolationFine(violation_id=v.id, hoa_id=v.hoa_id, amount=amount, kind="assessment", note="Migrated fine"))
    if v.fine_paid:
        db.add(ViolationFine(violation_id=v.id, hoa_id=v.hoa_id, amount=amount, kind="payment", note="Migrated payment"))
    v.fine_amount = 0
    v.fine_paid = False


def serialize_violation(v: Violation, resident: Optional[Resident] = None, note_count: Optional[int] = None,
                        photo_count: int = 0, repeat_count: int = 0, fines: Optional[tuple] = None,
                        resident_response_count: int = 0, db: Optional[Session] = None):
    if fines is None:
        fines = fine_totals(db, v) if db is not None else (float(v.fine_amount or 0), float(v.fine_amount or 0) if v.fine_paid else 0.0)
    assessed, paid = fines
    balance = max(0.0, round(assessed - paid, 2))
    return {
        "id": v.id,
        "hoa_id": v.hoa_id,
        "resident_id": v.resident_id,
        "resident_name": resident.name if resident else None,
        "resident_unit": resident.unit if resident else None,
        "resident_email": resident.email if resident else None,
        "violation_type": v.violation_type,
        "description": v.description,
        "status": v.status,
        "priority": v.priority or "medium",
        "notice_level": v.notice_level or 0,
        "notice_label": NOTICE_LEVELS[min(v.notice_level or 0, len(NOTICE_LEVELS) - 1)],
        # fine_amount/fine_paid keep their historical meaning for existing
        # consumers: total assessed, and fully-settled.
        "fine_amount": round(assessed, 2),
        "fine_paid": bool(assessed > 0 and balance <= 0),
        "fine_paid_total": round(paid, 2),
        "fine_balance": balance,
        "due_date": v.due_date.isoformat() if v.due_date else None,
        "resolved_at": v.resolved_at.isoformat() if v.resolved_at else None,
        "email_sent_at": v.email_sent_at.isoformat() if v.email_sent_at else None,
        "letter_sent_snapshot": bool(v.generated_letter),
        "created_at": v.created_at.isoformat(),
        "note_count": note_count,
        "photo_count": photo_count,
        "repeat_count": repeat_count,
        "resident_response_count": resident_response_count,
    }


def count_prior_offenses(db: Session, violation: Violation) -> int:
    """Prior violations of the same type by the same resident in the last 12
    months — the industry trigger for skipping straight to a sterner notice."""
    cutoff = datetime.utcnow() - timedelta(days=365)
    return (
        db.query(func.count(Violation.id))
        .filter(
            Violation.resident_id == violation.resident_id,
            Violation.violation_type == violation.violation_type,
            Violation.id != violation.id,
            Violation.created_at >= cutoff,
        )
        .scalar() or 0
    )


def compute_analytics(hoa: HOA, db: Session):
    violations = db.query(Violation).filter(Violation.hoa_id == hoa.id).all()
    residents = db.query(Resident).filter(Resident.hoa_id == hoa.id).all()
    resident_map = {r.id: r for r in residents}          # includes archived, for name lookups
    active_residents = [r for r in residents if not r.archived_at]
    fines = fine_totals_batch(db, hoa.id)

    def totals_for(v):
        if v.id in fines:
            return fines[v.id]
        legacy = float(v.fine_amount or 0)
        return legacy, (legacy if v.fine_paid else 0.0)

    now = datetime.utcnow()

    total = len(violations)
    resolved = [v for v in violations if v.status == "resolved"]
    overdue = [v for v in violations if v.status != "resolved" and v.due_date and v.due_date < now]

    durations = [(v.resolved_at - v.created_at).days for v in resolved if v.resolved_at and v.created_at]
    avg_days = round(sum(durations) / len(durations), 1) if durations else 0
    resolution_rate = round((len(resolved) / total) * 100) if total else 0

    def breakdown(key_fn):
        counts = {}
        for v in violations:
            k = key_fn(v)
            counts[k] = counts.get(k, 0) + 1
        return counts

    by_type = breakdown(lambda v: v.violation_type or "Other")
    by_status = breakdown(lambda v: v.status or "open")
    by_priority = breakdown(lambda v: v.priority or "medium")

    months = []
    cursor = datetime(now.year, now.month, 1)
    for _ in range(6):
        months.append(cursor)
        cursor = datetime(cursor.year - 1, 12, 1) if cursor.month == 1 else datetime(cursor.year, cursor.month - 1, 1)
    months.reverse()

    def mk(d):
        return f"{d.year}-{d.month:02d}"

    new_by_month = {mk(m): 0 for m in months}
    resolved_by_month = {mk(m): 0 for m in months}
    for v in violations:
        if v.created_at and mk(v.created_at) in new_by_month:
            new_by_month[mk(v.created_at)] += 1
        if v.resolved_at and mk(v.resolved_at) in resolved_by_month:
            resolved_by_month[mk(v.resolved_at)] += 1
    timeline = [{"month": m.strftime("%b"), "key": mk(m), "new": new_by_month[mk(m)], "resolved": resolved_by_month[mk(m)]} for m in months]

    offender_counts = {}
    for v in violations:
        offender_counts.setdefault(v.resident_id, {"total": 0, "open": 0})
        offender_counts[v.resident_id]["total"] += 1
        if v.status != "resolved":
            offender_counts[v.resident_id]["open"] += 1
    top_offenders = []
    for rid, c in offender_counts.items():
        r = resident_map.get(rid)
        if r:
            top_offenders.append({"resident_id": rid, "name": r.name, "unit": r.unit, "total": c["total"], "open": c["open"]})
    top_offenders.sort(key=lambda x: x["total"], reverse=True)
    top_offenders = top_offenders[:5]

    return {
        "kpis": {
            "total_violations": total,
            "open_violations": sum(1 for v in violations if v.status != "resolved"),
            "resolved_violations": len(resolved),
            "overdue_violations": len(overdue),
            "resolution_rate": resolution_rate,
            "avg_days_to_resolve": avg_days,
            "total_fines": round(sum(totals_for(v)[0] for v in violations), 2),
            "outstanding_fines": round(sum(max(0.0, totals_for(v)[0] - totals_for(v)[1]) for v in violations), 2),
            "collected_fines": round(sum(totals_for(v)[1] for v in violations), 2),
            "total_residents": len(active_residents),
        },
        "by_type": [{"label": k, "value": v} for k, v in sorted(by_type.items(), key=lambda x: x[1], reverse=True)],
        "by_status": [{"label": k, "value": v} for k, v in by_status.items()],
        "by_priority": [{"label": k, "value": v} for k, v in by_priority.items()],
        "timeline": timeline,
        "top_offenders": top_offenders,
    }


# -- Health --

@app.get("/")
def root():
    return {"message": "HOA Violation Tracker API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# -- Auth --

@app.post("/auth/register")
def register(data: UserRegister, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Registration is invite-only. The operator email bootstraps as admin
    # without a code (there'd be no one to mint the first code otherwise);
    # everyone else must present a valid, unused invite code.
    is_admin = email == ADMIN_EMAIL
    invite = None
    if not is_admin:
        code = (data.invite_code or "").strip()
        if code:
            invite = db.query(InviteCode).filter(InviteCode.code == code).first()
        if not invite or invite.used_at is not None:
            raise HTTPException(
                status_code=403,
                detail="Sign-up is invite-only. Use the link from your welcome email, "
                       "or contact us to get access.",
            )

    user = User(email=email, hashed_password=utils.hash_password(data.password), is_admin=is_admin)
    db.add(user)
    db.flush()
    if invite is not None:
        invite.used_by = user.id
        invite.used_at = datetime.utcnow()
    # If registering via invite with HOA info, create the HOA
    if data.hoa_name and invite is not None:
        hoa = HOA(
            name=data.hoa_name.strip(),
            address=(data.hoa_address or "").strip(),
            user_id=user.id
        )
        db.add(hoa)
    db.commit()
    db.refresh(user)
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


@app.get("/auth/me")
def whoami(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.email.lower() == ADMIN_EMAIL and not current_user.is_admin:
        current_user.is_admin = True
        db.commit()
    return {"id": current_user.id, "email": current_user.email, "is_admin": bool(current_user.is_admin)}


@app.post("/auth/change-password")
def change_password(data: ChangePassword, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not utils.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.hashed_password = utils.hash_password(data.new_password)
    db.commit()
    return {"message": "Password updated."}


@app.post("/admin/invites")
def create_invite(data: InviteCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Mint a single-use signup code. The operator sends the paying customer a
    link containing it (e.g. https://app/?invite=CODE)."""
    code = secrets.token_urlsafe(9)
    invite = InviteCode(code=code, label=(data.label or None), created_by=admin.id)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "code": invite.code, "label": invite.label, "created_at": invite.created_at.isoformat()}


@app.get("/admin/invites")
def list_invites(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    invites = db.query(InviteCode).order_by(InviteCode.created_at.desc()).all()
    used_emails = {}
    used_ids = [i.used_by for i in invites if i.used_by]
    if used_ids:
        used_emails = {u.id: u.email for u in db.query(User).filter(User.id.in_(used_ids)).all()}
    return [
        {
            "id": i.id,
            "code": i.code,
            "label": i.label,
            "used": i.used_at is not None,
            "used_by_email": used_emails.get(i.used_by),
            "used_at": i.used_at.isoformat() if i.used_at else None,
            "created_at": i.created_at.isoformat(),
        }
        for i in invites
    ]


@app.delete("/admin/invites/{invite_id}")
def revoke_invite(invite_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    invite = db.query(InviteCode).filter(InviteCode.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="That invite has already been used and can't be revoked")
    db.delete(invite)
    db.commit()
    return {"message": "Invite revoked"}


@app.post("/auth/login")
def login(data: UserRegister, db: Session = Depends(get_db)):
    email = data.email.strip()
    check_login_rate(email.lower())
    user = (db.query(User).filter(User.email == email).first()
            or db.query(User).filter(func.lower(User.email) == email.lower()).first())
    if not user or not utils.verify_password(data.password, user.hashed_password):
        record_login_failure(email.lower())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _login_failures.pop(email.lower(), None)
    # Self-heal: the designated operator email is always admin, even if the
    # account was created before the admin flag existed.
    if user.email.lower() == ADMIN_EMAIL and not user.is_admin:
        user.is_admin = True
        db.commit()
    return {"access_token": utils.create_access_token({"sub": str(user.id)}), "token_type": "bearer"}


class ForgotPassword(BaseModel):
    email: str


class ResetPassword(BaseModel):
    token: str
    password: str


@app.post("/auth/forgot")
def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)):
    """Issue a 30-minute reset link by email. Responds identically whether or
    not the account exists, to avoid leaking which emails are registered."""
    email = data.email.strip().lower()
    check_login_rate(f"forgot:{email}")
    record_login_failure(f"forgot:{email}")  # also throttles reset spam
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user:
        token = utils.create_access_token({"sub": str(user.id), "purpose": "pwreset"}, timedelta(minutes=30))
        reset_url = f"{os.getenv('FRONTEND_URL', '').rstrip('/')}/reset?token={token}"
        try:
            utils.send_email(
                to=user.email,
                subject="Reset your ViolationTrack password",
                body=f"A password reset was requested for your ViolationTrack account.\n\n"
                     f"Reset link (valid 30 minutes):\n{reset_url}\n\n"
                     f"If you didn't request this, you can ignore this email.",
            )
        except LookupError:
            pass  # SMTP not configured — respond generically anyway
        except Exception:
            pass
    return {"message": "If that account exists, a reset link has been sent."}


@app.post("/auth/reset")
def reset_password(data: ResetPassword, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(data.token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        if payload.get("purpose") != "pwreset":
            raise jwt.InvalidTokenError()
        user_id = int(payload.get("sub"))
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user.hashed_password = utils.hash_password(data.password)
    db.commit()
    return {"message": "Password updated. You can sign in now."}


# -- Portfolio (HOAs / clients) --

@app.get("/hoas")
def list_hoas(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_admin:
        hoas = db.query(HOA).order_by(HOA.name).all()
    else:
        hoas = db.query(HOA).filter(HOA.user_id == current_user.id).order_by(HOA.name).all()
    hoa_ids = [h.id for h in hoas]
    if not hoa_ids:
        return []

    res_counts = dict(
        db.query(Resident.hoa_id, func.count(Resident.id))
        .filter(Resident.hoa_id.in_(hoa_ids), Resident.archived_at.is_(None)).group_by(Resident.hoa_id).all()
    )
    violations = db.query(Violation).filter(Violation.hoa_id.in_(hoa_ids)).all()

    ledger = {}
    for vid, kind, total in db.query(ViolationFine.violation_id, ViolationFine.kind, func.sum(ViolationFine.amount)).filter(
            ViolationFine.hoa_id.in_(hoa_ids)).group_by(ViolationFine.violation_id, ViolationFine.kind).all():
        a, p = ledger.get(vid, (0.0, 0.0))
        if kind == "assessment":
            a += float(total or 0)
        else:
            p += float(total or 0)
        ledger[vid] = (a, p)

    now = datetime.utcnow()
    agg = {hid: {"total": 0, "open": 0, "overdue": 0, "fines": 0.0} for hid in hoa_ids}
    for v in violations:
        a = agg[v.hoa_id]
        a["total"] += 1
        if v.status != "resolved":
            a["open"] += 1
            if v.due_date and v.due_date < now:
                a["overdue"] += 1
        if v.id in ledger:
            assessed, paid = ledger[v.id]
            a["fines"] += max(0.0, assessed - paid)
        elif not v.fine_paid:
            a["fines"] += float(v.fine_amount or 0)

    return [
        {
            "id": h.id, "name": h.name, "address": h.address,
            "email": getattr(h, 'email', None),
            "phone": getattr(h, 'phone', None),
            "contact_person_name": getattr(h, 'contact_person_name', None),
            "website": getattr(h, 'website', None),
            "business_hours": getattr(h, 'business_hours', None),
            "total_residents": int(res_counts.get(h.id, 0)),
            "total_violations": agg[h.id]["total"],
            "open_violations": agg[h.id]["open"],
            "overdue_violations": agg[h.id]["overdue"],
            "outstanding_fines": round(agg[h.id]["fines"], 2),
        }
        for h in hoas
    ]


@app.post("/hoas")
def create_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = HOA(name=data.name, address=data.address, user_id=current_user.id)
    # Try to set contact fields, but ignore if columns don't exist
    try:
        hoa.email = data.email
        hoa.phone = data.phone
        hoa.contact_person_name = data.contact_person_name
        hoa.website = data.website
        hoa.business_hours = data.business_hours
    except:
        pass
    db.add(hoa)
    db.commit()
    db.refresh(hoa)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', data.email),
        "phone": getattr(hoa, 'phone', data.phone),
        "contact_person_name": getattr(hoa, 'contact_person_name', data.contact_person_name),
        "website": getattr(hoa, 'website', data.website),
        "business_hours": getattr(hoa, 'business_hours', data.business_hours),
    }


# Backward-compatible alias for the old one-time setup endpoint
@app.post("/hoas/setup")
def setup_hoa(data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_hoa(data, current_user, db)


@app.get("/hoas/{hoa_id}")
def get_hoa(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', None),
        "phone": getattr(hoa, 'phone', None),
        "contact_person_name": getattr(hoa, 'contact_person_name', None),
        "website": getattr(hoa, 'website', None),
        "business_hours": getattr(hoa, 'business_hours', None),
    }


@app.patch("/hoas/{hoa_id}")
def update_hoa(hoa_id: int, data: HOACreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    hoa.name = data.name
    hoa.address = data.address
    # Try to save to database, but these columns might not exist yet
    try:
        hoa.email = data.email
        hoa.phone = data.phone
        hoa.contact_person_name = data.contact_person_name
        hoa.website = data.website
        hoa.business_hours = data.business_hours
    except:
        pass
    db.commit()
    db.refresh(hoa)
    return {
        "id": hoa.id, "name": hoa.name, "address": hoa.address,
        "email": getattr(hoa, 'email', data.email),
        "phone": getattr(hoa, 'phone', data.phone),
        "contact_person_name": getattr(hoa, 'contact_person_name', data.contact_person_name),
        "website": getattr(hoa, 'website', data.website),
        "business_hours": getattr(hoa, 'business_hours', data.business_hours),
    }


@app.delete("/hoas/{hoa_id}")
def delete_hoa(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    # Explicitly delete related violation notes, fines, and photos first (they reference HOA directly)
    db.query(ViolationNote).filter(ViolationNote.hoa_id == hoa_id).delete()
    db.query(ViolationFine).filter(ViolationFine.hoa_id == hoa_id).delete()
    db.query(ViolationPhoto).filter(ViolationPhoto.hoa_id == hoa_id).delete()
    # Delete violations and residents (cascade will handle nested relationships)
    db.delete(hoa)
    db.commit()
    return {"message": "Client deleted"}


@app.get("/hoas/{hoa_id}/stats")
def get_stats(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return compute_analytics(hoa, db)["kpis"]


@app.get("/hoas/{hoa_id}/analytics")
def get_analytics(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    return compute_analytics(hoa, db)


# -- Demo data (one-click sample community for demos and evaluation) --

DEMO_RESIDENTS = [
    ("James Whitfield", "101", "j.whitfield@example.com", "555-0101"),
    ("Maria Delgado", "102", "maria.delgado@example.com", "555-0102"),
    ("Robert Chen", "205", "rchen@example.com", None),
    ("Angela Foster", "208", "angela.foster@example.com", "555-0208"),
    ("Derek Okafor", "314", "d.okafor@example.com", "555-0314"),
    ("Susan Marsh", "317", None, "555-0317"),
    ("Tom Callahan", "402", "tcallahan@example.com", "555-0402"),
    ("Priya Natarajan", "409", "priya.n@example.com", "555-0409"),
]

DEMO_VIOLATIONS = [
    # (unit, type, description, priority, status, days_ago, due_in, fine, paid, notice_level)
    ("101", "Landscaping / Lawn Care", "Front lawn exceeds 6 inches; edging along walkway overgrown.", "medium", "noticed", 20, 14, 0, False, 1),
    ("102", "Parking Violation", "Inoperable vehicle (flat tires, expired tags) parked in driveway for over 30 days.", "high", "escalated", 45, 14, 100, False, 2),
    ("205", "Trash / Debris", "Trash bins left at curb for three consecutive days after pickup.", "low", "resolved", 33, 7, 0, False, 1),
    ("208", "Exterior Maintenance", "Peeling paint and visible wood rot on street-facing fascia boards.", "medium", "open", 10, 30, 0, False, 0),
    ("314", "Pet Violation", "Dog repeatedly off-leash in common areas despite prior verbal reminder.", "medium", "noticed", 15, 14, 50, True, 1),
    ("317", "Architectural Modification", "Storage shed erected in rear yard without ARC approval.", "high", "open", 5, 30, 0, False, 0),
    ("402", "Holiday Decorations", "Holiday lighting still installed more than 30 days past the season.", "low", "resolved", 60, 14, 0, False, 1),
    ("101", "Trash / Debris", "Construction debris pile visible beside garage.", "medium", "open", 3, 14, 0, False, 0),
    ("102", "Parking Violation", "Commercial box truck parked overnight in guest spaces.", "medium", "open", 2, 14, 0, False, 0),
    ("409", "Pool / Amenity Misuse", "Unaccompanied guests using pool facility after hours.", "low", "resolved", 25, 7, 0, False, 0),
]


@app.post("/hoas/{hoa_id}/seed-demo")
def seed_demo_data(hoa_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Populate an empty community with realistic sample residents + violations."""
    hoa = owned_hoa(hoa_id, current_user, db)
    if db.query(func.count(Resident.id)).filter(Resident.hoa_id == hoa.id).scalar():
        raise HTTPException(status_code=400, detail="Demo data can only be loaded into an empty community")

    by_unit = {}
    for name, unit, email, phone in DEMO_RESIDENTS:
        r = Resident(hoa_id=hoa.id, name=name, unit=unit, email=email, phone=phone)
        db.add(r)
        by_unit[unit] = r
    db.flush()

    now = datetime.utcnow()
    for unit, vtype, desc, priority, status, days_ago, due_in, fine, paid, notice in DEMO_VIOLATIONS:
        created = now - timedelta(days=days_ago)
        v = Violation(
            hoa_id=hoa.id, resident_id=by_unit[unit].id, violation_type=vtype, description=desc,
            status=status, priority=priority, notice_level=notice,
            created_at=created, due_date=end_of_day(created + timedelta(days=due_in)),
            resolved_at=(created + timedelta(days=random.randint(3, due_in))) if status == "resolved" else None,
            email_sent_at=(created + timedelta(days=1)) if notice > 0 else None,
        )
        db.add(v)
        db.flush()
        if fine > 0:
            db.add(ViolationFine(violation_id=v.id, hoa_id=hoa.id, amount=fine, kind="assessment", note="Demo fine"))
            if paid:
                db.add(ViolationFine(violation_id=v.id, hoa_id=hoa.id, amount=fine, kind="payment", note="Demo payment"))
        add_system_note(db, v, f"Violation opened — {due_in}-day cure period")
        if notice > 0:
            add_system_note(db, v, "Violation notice emailed to resident")
        if status == "resolved":
            add_system_note(db, v, "Status changed from noticed to resolved")
    db.commit()
    return {"message": f"Loaded {len(DEMO_RESIDENTS)} residents and {len(DEMO_VIOLATIONS)} violations", "residents": len(DEMO_RESIDENTS), "violations": len(DEMO_VIOLATIONS)}


# -- Residents --

def unit_conflict(db: Session, hoa_id: int, unit: str, exclude_id: Optional[int] = None) -> bool:
    """Active (non-archived) residents must have unique units — violation CSV
    import matches rows by unit, so duplicates would make matching ambiguous."""
    q = db.query(Resident).filter(
        Resident.hoa_id == hoa_id,
        func.lower(Resident.unit) == unit.strip().lower(),
        Resident.archived_at.is_(None),
    )
    if exclude_id:
        q = q.filter(Resident.id != exclude_id)
    return db.query(q.exists()).scalar()


def serialize_resident(r: Resident, violation_count: int = 0, open_count: int = 0):
    return {
        "id": r.id, "name": r.name, "unit": r.unit, "email": r.email, "phone": r.phone, "hoa_id": r.hoa_id,
        "archived_at": r.archived_at.isoformat() if r.archived_at else None,
        "violation_count": violation_count, "open_count": open_count,
    }


@app.post("/residents")
def add_resident(data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.hoa_id:
        raise HTTPException(status_code=400, detail="hoa_id is required")
    hoa = owned_hoa(data.hoa_id, current_user, db)
    if unit_conflict(db, hoa.id, data.unit):
        raise HTTPException(status_code=400, detail=f"A resident already exists for unit '{data.unit}'")
    resident = Resident(hoa_id=hoa.id, name=data.name, unit=data.unit, email=data.email or None, phone=data.phone or None)
    db.add(resident)
    db.commit()
    db.refresh(resident)
    return serialize_resident(resident)


@app.get("/residents")
def get_residents(hoa_id: int, include_archived: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    q = db.query(Resident).filter(Resident.hoa_id == hoa.id)
    if not include_archived:
        q = q.filter(Resident.archived_at.is_(None))
    residents = q.order_by(Resident.name).all()
    total_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id).group_by(Violation.resident_id).all()
    )
    open_counts = dict(
        db.query(Violation.resident_id, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id, Violation.status != "resolved").group_by(Violation.resident_id).all()
    )
    return [
        serialize_resident(r, int(total_counts.get(r.id, 0)), int(open_counts.get(r.id, 0)))
        for r in residents
    ]


@app.patch("/residents/{resident_id}")
def update_resident(resident_id: int, data: ResidentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = owned_resident(resident_id, current_user, db)
    if unit_conflict(db, resident.hoa_id, data.unit, exclude_id=resident.id):
        raise HTTPException(status_code=400, detail=f"A resident already exists for unit '{data.unit}'")
    resident.name = data.name
    resident.unit = data.unit
    resident.email = data.email or None
    resident.phone = data.phone or None
    db.commit()
    db.refresh(resident)
    return serialize_resident(resident)


@app.delete("/residents/{resident_id}")
def delete_resident(resident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Residents with enforcement history are archived, not erased — the
    violation record must survive a move-out. Residents with no history are
    deleted outright."""
    resident = owned_resident(resident_id, current_user, db)
    has_history = db.query(
        db.query(Violation).filter(Violation.resident_id == resident.id).exists()
    ).scalar()
    if has_history:
        resident.archived_at = datetime.utcnow()
        db.commit()
        return {"archived": True, "message": f"{resident.name} archived — violation history preserved"}
    db.delete(resident)
    db.commit()
    return {"archived": False, "message": "Resident deleted"}


@app.post("/residents/{resident_id}/restore")
def restore_resident(resident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resident = owned_resident(resident_id, current_user, db)
    if not resident.archived_at:
        raise HTTPException(status_code=400, detail="Resident is not archived")
    if unit_conflict(db, resident.hoa_id, resident.unit):
        raise HTTPException(status_code=400, detail=f"Unit '{resident.unit}' is now occupied by another resident")
    resident.archived_at = None
    db.commit()
    db.refresh(resident)
    return serialize_resident(resident)


@app.post("/residents/import/csv")
async def import_residents_csv(hoa_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        added = 0
        errors = []
        # Seed with existing units so duplicates are caught both against the DB
        # and within the file itself (uncommitted rows are invisible to queries).
        seen_units = {
            (u or "").strip().lower()
            for (u,) in db.query(Resident.unit).filter(Resident.hoa_id == hoa.id, Resident.archived_at.is_(None)).all()
        }
        for idx, row in enumerate(reader, 1):
            row = {(k or "").strip().lower(): v for k, v in row.items()}
            name = (row.get("name") or "").strip()
            unit = (row.get("unit") or row.get("address") or "").strip()
            if not name or not unit:
                errors.append(f"Row {idx}: Missing required fields (name, unit/address)")
                continue
            if unit.lower() in seen_units:
                errors.append(f"Row {idx}: '{unit}' already exists")
                continue
            seen_units.add(unit.lower())
            db.add(Resident(hoa_id=hoa.id, name=name, unit=unit,
                            email=(row.get("email") or "").strip() or None,
                            phone=(row.get("phone") or "").strip() or None))
            added += 1
        db.commit()
        return {"added": added, "errors": errors, "message": f"Successfully imported {added} residents"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


# -- Violations --

@app.post("/violations")
def add_violation(data: ViolationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.hoa_id:
        raise HTTPException(status_code=400, detail="hoa_id is required")
    hoa = owned_hoa(data.hoa_id, current_user, db)
    resident = db.query(Resident).filter(Resident.id == data.resident_id, Resident.hoa_id == hoa.id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")

    priority = data.priority if data.priority in VALID_PRIORITIES else "medium"
    due_days = data.due_in_days if (data.due_in_days and data.due_in_days > 0) else 14
    due_date = end_of_day(datetime.utcnow() + timedelta(days=due_days))

    violation = Violation(hoa_id=hoa.id, resident_id=data.resident_id, violation_type=data.violation_type,
                          description=data.description, status="open", priority=priority, due_date=due_date, notice_level=0)
    db.add(violation)
    db.commit()
    db.refresh(violation)
    add_system_note(db, violation, f"Violation opened — {due_days}-day cure period (due {due_date.strftime('%b %d, %Y')})")

    # Repeat-offense detection: same resident, same violation type, past 12 months.
    repeat = count_prior_offenses(db, violation)
    note_count = 1
    if repeat > 0:
        nth = {1: "2nd", 2: "3rd"}.get(repeat, f"{repeat + 1}th")
        add_system_note(db, violation, f"⚠ Repeat offense — {nth} {violation.violation_type} violation for this resident in the last 12 months. Consider a sterner notice level.")
        note_count = 2
    db.commit()
    return serialize_violation(violation, resident, note_count=note_count, repeat_count=repeat)


@app.get("/violations")
def get_violations(hoa_id: int, status: str = None, limit: Optional[int] = None, offset: int = 0,
                   current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    q = db.query(Violation).filter(Violation.hoa_id == hoa.id)
    if status:
        q = q.filter(Violation.status == status)
    q = q.order_by(Violation.created_at.desc())
    if offset:
        q = q.offset(max(0, offset))
    if limit:
        q = q.limit(max(1, min(limit, 500)))
    violations = q.all()

    # Includes archived residents so history rows still resolve names
    residents = {r.id: r for r in db.query(Resident).filter(Resident.hoa_id == hoa.id).all()}
    note_counts = dict(
        db.query(ViolationNote.violation_id, func.count(ViolationNote.id))
        .filter(ViolationNote.hoa_id == hoa.id).group_by(ViolationNote.violation_id).all()
    )
    photo_counts = dict(
        db.query(ViolationPhoto.violation_id, func.count(ViolationPhoto.id))
        .filter(ViolationPhoto.hoa_id == hoa.id).group_by(ViolationPhoto.violation_id).all()
    )
    response_counts = dict(
        db.query(ViolationNote.violation_id, func.count(ViolationNote.id))
        .filter(ViolationNote.hoa_id == hoa.id, ViolationNote.kind == "resident")
        .group_by(ViolationNote.violation_id).all()
    )
    fines = fine_totals_batch(db, hoa.id)

    # Repeat pattern: violations sharing (resident, type) within the past year
    cutoff = datetime.utcnow() - timedelta(days=365)
    pair_counts = dict(
        ((rid, vtype), int(c)) for rid, vtype, c in
        db.query(Violation.resident_id, Violation.violation_type, func.count(Violation.id))
        .filter(Violation.hoa_id == hoa.id, Violation.created_at >= cutoff)
        .group_by(Violation.resident_id, Violation.violation_type).all()
    )

    def repeat_for(v):
        if not v.created_at or v.created_at < cutoff:
            return 0
        return max(0, pair_counts.get((v.resident_id, v.violation_type), 1) - 1)

    return [
        serialize_violation(v, residents.get(v.resident_id), note_count=int(note_counts.get(v.id, 0)),
                            photo_count=int(photo_counts.get(v.id, 0)), repeat_count=repeat_for(v),
                            fines=fines.get(v.id), resident_response_count=int(response_counts.get(v.id, 0)))
        for v in violations
    ]


def build_letter(violation: Violation, db: Session) -> str:
    """The current draft letter, generated from live violation data."""
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    hoa = db.query(HOA).filter(HOA.id == violation.hoa_id).first()
    photo_count = db.query(func.count(ViolationPhoto.id)).filter(ViolationPhoto.violation_id == violation.id).scalar() or 0
    assessed, _paid = fine_totals(db, violation)
    return utils.generate_violation_letter(
        resident_name=resident.name,
        violation_type=violation.violation_type,
        description=violation.description,
        date=violation.created_at.strftime("%Y-%m-%d"),
        property_address=resident.unit,
        hoa_name=hoa.name if hoa else None,
        hoa_contact_person=hoa.contact_person_name if hoa else None,
        hoa_email=hoa.email if hoa else None,
        hoa_phone=hoa.phone if hoa else None,
        hoa_website=hoa.website if hoa else None,
        due_date=violation.due_date.strftime("%B %d, %Y") if violation.due_date else None,
        fine_amount=assessed,
        notice_label=NOTICE_LEVELS[min(violation.notice_level or 0, len(NOTICE_LEVELS) - 1)],
        repeat_count=count_prior_offenses(db, violation),
        photo_count=int(photo_count),
    )


def build_letter_with_portal(violation: Violation, db: Session) -> str:
    """Letter plus the resident's self-service link (when a frontend URL is set)."""
    letter = build_letter(violation, db)
    base = os.getenv("FRONTEND_URL", "").rstrip("/")
    if base:
        letter += f"\n\nView your case, see the evidence on file, and respond online:\n{base}/v/{create_portal_token(violation.id)}\n"
    return letter


@app.get("/violations/{violation_id}/letter")
def get_violation_letter(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns the current draft plus, if a notice was already sent, the exact
    letter that went out — the sent snapshot never changes after the fact."""
    violation = owned_violation(violation_id, current_user, db)
    return {
        "letter": build_letter_with_portal(violation, db),
        "sent_letter": violation.generated_letter,
        "sent_at": violation.email_sent_at.isoformat() if violation.email_sent_at else None,
    }


@app.get("/violations/{violation_id}/letter.pdf")
def get_violation_letter_pdf(violation_id: int, version: str = "draft", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Printable PDF of the violation letter — for certified mail / hand delivery.
    version=sent downloads the snapshot of the letter as it was sent."""
    violation = owned_violation(violation_id, current_user, db)
    if version == "sent":
        if not violation.generated_letter:
            raise HTTPException(status_code=404, detail="No sent letter on file for this violation")
        letter = violation.generated_letter
    else:
        letter = build_letter(violation, db)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    pdf = utils.generate_pdf(letter, resident.name if resident else "resident")
    if not pdf:
        raise HTTPException(status_code=500, detail="PDF generation failed")
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", resident.name if resident else "letter")
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="violation_notice_{safe_name}.pdf"'})


@app.get("/violations/{violation_id}/case-file.pdf")
def get_case_file_pdf(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The complete evidence package for a hearing or attorney handoff."""
    violation = owned_violation(violation_id, current_user, db)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    hoa = db.query(HOA).filter(HOA.id == violation.hoa_id).first()
    migrate_legacy_fine(db, violation)
    db.commit()
    assessed, paid = fine_totals(db, violation)
    entries = db.query(ViolationFine).filter(ViolationFine.violation_id == violation.id).order_by(ViolationFine.created_at.asc()).all()
    notes = db.query(ViolationNote).filter(ViolationNote.violation_id == violation.id).order_by(ViolationNote.created_at.asc()).all()
    photos = db.query(ViolationPhoto).filter(ViolationPhoto.violation_id == violation.id).order_by(ViolationPhoto.created_at.asc()).all()

    fmt = lambda d: d.strftime("%b %d, %Y") if d else None
    case = {
        "case_id": violation.id,
        "hoa_name": hoa.name if hoa else "Homeowners Association",
        "resident_name": resident.name if resident else None,
        "property": resident.unit if resident else None,
        "violation_type": violation.violation_type,
        "description": violation.description,
        "status": violation.status,
        "notice_label": NOTICE_LEVELS[min(violation.notice_level or 0, len(NOTICE_LEVELS) - 1)],
        "priority": violation.priority,
        "created_at": fmt(violation.created_at),
        "due_date": fmt(violation.due_date),
        "resolved_at": fmt(violation.resolved_at),
        "fine": {"assessed": assessed, "paid": paid, "balance": max(0.0, assessed - paid)},
        "ledger": [(fmt(f.created_at), f.kind, float(f.amount), f.note) for f in entries],
        "timeline": [(n.created_at.strftime("%b %d, %Y %H:%M"), n.kind, n.body) for n in notes],
        "sent_letter": violation.generated_letter,
        "sent_at": fmt(violation.email_sent_at),
        "photos": [p.data for p in photos],
    }
    pdf = utils.generate_case_file_pdf(case)
    if not pdf:
        raise HTTPException(status_code=500, detail="Case file generation failed")
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", resident.name if resident else "case")
    return StreamingResponse(pdf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="case_file_{violation.id}_{safe_name}.pdf"'})


@app.patch("/violations/{violation_id}")
def update_violation(violation_id: int, data: ViolationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    fields = data.model_dump(exclude_unset=True)

    if fields.get("status") is not None:
        new_status = fields["status"]
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
        if new_status != violation.status:
            add_system_note(db, violation, f"Status changed from {violation.status} to {new_status}")
            violation.status = new_status
            violation.resolved_at = datetime.utcnow() if new_status == "resolved" else None

    if fields.get("priority") is not None:
        if fields["priority"] not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        if fields["priority"] != violation.priority:
            add_system_note(db, violation, f"Priority set to {fields['priority']}")
        violation.priority = fields["priority"]

    if fields.get("due_date"):
        try:
            parsed = datetime.fromisoformat(fields["due_date"].replace("Z", "").split("T")[0])
            violation.due_date = end_of_day(parsed)
            add_system_note(db, violation, f"Cure deadline updated to {parsed.strftime('%b %d, %Y')}")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid due_date format (expected YYYY-MM-DD)")

    if fields.get("note"):
        note_body = fields["note"].strip()
        if note_body:
            db.add(ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=note_body, kind="note"))

    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident, db=db)


@app.post("/violations/{violation_id}/escalate")
def escalate_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    current = violation.notice_level or 0
    if current >= len(NOTICE_LEVELS) - 1:
        raise HTTPException(status_code=400, detail="Violation is already at the highest escalation level.")
    violation.notice_level = current + 1
    violation.status = "escalated"
    if violation.resolved_at:
        # Escalating a resolved case implicitly reopens it
        violation.resolved_at = None
        add_system_note(db, violation, "Violation reopened by escalation")
    add_system_note(db, violation, f"Escalated to {NOTICE_LEVELS[violation.notice_level]}")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident, db=db)


# -- Fine ledger --

@app.get("/violations/{violation_id}/fines")
def get_violation_fines(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    migrate_legacy_fine(db, violation)
    db.commit()
    entries = db.query(ViolationFine).filter(ViolationFine.violation_id == violation.id).order_by(ViolationFine.created_at.asc()).all()
    assessed, paid = fine_totals(db, violation)
    return {
        "entries": [{"id": f.id, "amount": float(f.amount), "kind": f.kind, "note": f.note, "created_at": f.created_at.isoformat()} for f in entries],
        "assessed": round(assessed, 2), "paid": round(paid, 2), "balance": max(0.0, round(assessed - paid, 2)),
    }


@app.post("/violations/{violation_id}/fines")
def add_violation_fine(violation_id: int, data: FineCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    if data.kind not in ("assessment", "payment"):
        raise HTTPException(status_code=400, detail="kind must be 'assessment' or 'payment'")
    amount = round(float(data.amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    migrate_legacy_fine(db, violation)
    assessed, paid = fine_totals(db, violation)
    if data.kind == "payment" and amount > round(assessed - paid, 2) + 1e-9:
        raise HTTPException(status_code=400, detail=f"Payment exceeds the outstanding balance (${max(0.0, assessed - paid):,.2f})")

    note = (data.note or "").strip() or None
    db.add(ViolationFine(violation_id=violation.id, hoa_id=violation.hoa_id, amount=amount, kind=data.kind, note=note))
    verb = "Fine assessed" if data.kind == "assessment" else "Payment recorded"
    add_system_note(db, violation, f"{verb}: ${amount:,.2f}" + (f" — {note}" if note else ""))
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return serialize_violation(violation, resident, db=db)


@app.get("/violations/{violation_id}/notes")
def get_violation_notes(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_violation(violation_id, current_user, db)
    notes = db.query(ViolationNote).filter(ViolationNote.violation_id == violation_id).order_by(ViolationNote.created_at.asc()).all()
    return [{"id": n.id, "body": n.body, "kind": n.kind, "created_at": n.created_at.isoformat()} for n in notes]


@app.post("/violations/{violation_id}/notes")
def add_violation_note(violation_id: int, data: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    if not data.body or not data.body.strip():
        raise HTTPException(status_code=400, detail="Note body cannot be empty")
    note = ViolationNote(violation_id=violation.id, hoa_id=violation.hoa_id, body=data.body.strip(), kind="note")
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "body": note.body, "kind": note.kind, "created_at": note.created_at.isoformat()}


# -- Resident portal (public, token-authenticated) --

class PortalResponse(BaseModel):
    kind: str            # fixed | dispute | question
    message: str


PORTAL_RESPONSE_LABELS = {
    "fixed": "Resident reports the violation corrected",
    "dispute": "Resident disputes this violation",
    "question": "Resident question",
}


@app.get("/portal/{token}")
def portal_case(token: str, db: Session = Depends(get_db)):
    """Everything a resident needs to understand and act on their notice."""
    v = portal_violation(token, db)
    resident = db.query(Resident).filter(Resident.id == v.resident_id).first()
    hoa = db.query(HOA).filter(HOA.id == v.hoa_id).first()
    photos = db.query(ViolationPhoto).filter(ViolationPhoto.violation_id == v.id).order_by(ViolationPhoto.created_at.asc()).all()
    assessed, paid = fine_totals(db, v)
    responses = (
        db.query(ViolationNote)
        .filter(ViolationNote.violation_id == v.id, ViolationNote.kind == "resident")
        .order_by(ViolationNote.created_at.asc()).all()
    )
    return {
        "hoa": {
            "name": hoa.name if hoa else "Homeowners Association",
            "email": getattr(hoa, "email", None),
            "phone": getattr(hoa, "phone", None),
        },
        "resident_name": resident.name if resident else None,
        "property": resident.unit if resident else None,
        "violation_type": v.violation_type,
        "description": v.description,
        "status": v.status,
        "notice_label": NOTICE_LEVELS[min(v.notice_level or 0, len(NOTICE_LEVELS) - 1)],
        "due_date": v.due_date.isoformat() if v.due_date else None,
        "created_at": v.created_at.isoformat(),
        "resolved_at": v.resolved_at.isoformat() if v.resolved_at else None,
        "fine_assessed": round(assessed, 2),
        "fine_balance": max(0.0, round(assessed - paid, 2)),
        "letter_sent_at": v.email_sent_at.isoformat() if v.email_sent_at else None,
        "sent_letter": v.generated_letter,
        "photos": [{"data": p.data, "created_at": p.created_at.isoformat()} for p in photos],
        "responses": [{"body": n.body, "created_at": n.created_at.isoformat()} for n in responses],
    }


@app.post("/portal/{token}/respond")
def portal_respond(token: str, data: PortalResponse, db: Session = Depends(get_db)):
    v = portal_violation(token, db)
    check_login_rate(f"portal:{v.id}")   # throttle public writes per case
    record_login_failure(f"portal:{v.id}")
    if data.kind not in PORTAL_RESPONSE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid response type")
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message is too long (2000 characters max)")
    body = f"{PORTAL_RESPONSE_LABELS[data.kind]}: {message}"
    db.add(ViolationNote(violation_id=v.id, hoa_id=v.hoa_id, body=body, kind="resident"))
    db.commit()
    return {"message": "Your response has been recorded and shared with the association."}


@app.get("/violations/{violation_id}/portal-link")
def get_portal_link(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Manager-side: mint the shareable resident link for this case."""
    violation = owned_violation(violation_id, current_user, db)
    token = create_portal_token(violation.id)
    base = os.getenv("FRONTEND_URL", "").rstrip("/")
    return {"token": token, "url": f"{base}/v/{token}" if base else None, "expires_days": PORTAL_TOKEN_DAYS}


# -- Photo evidence --

MAX_PHOTO_BYTES = 4 * 1024 * 1024  # 4 MB per photo
MAX_PHOTOS_PER_VIOLATION = 8
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@app.post("/violations/{violation_id}/photos")
async def add_violation_photo(violation_id: int, file: UploadFile = File(...), caption: Optional[str] = None,
                              current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are supported")
    existing = db.query(func.count(ViolationPhoto.id)).filter(ViolationPhoto.violation_id == violation.id).scalar() or 0
    if existing >= MAX_PHOTOS_PER_VIOLATION:
        raise HTTPException(status_code=400, detail=f"Limit of {MAX_PHOTOS_PER_VIOLATION} photos per violation reached")
    raw = await file.read()
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Photo too large (max 4 MB). Resize it and try again.")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    data_url = f"data:{content_type};base64,{base64.b64encode(raw).decode('ascii')}"
    photo = ViolationPhoto(violation_id=violation.id, hoa_id=violation.hoa_id, data=data_url,
                           caption=(caption or "").strip() or None)
    db.add(photo)
    add_system_note(db, violation, "Photo evidence added" + (f" — {photo.caption}" if photo.caption else ""))
    db.commit()
    db.refresh(photo)
    return {"id": photo.id, "data": photo.data, "caption": photo.caption, "created_at": photo.created_at.isoformat()}


@app.get("/violations/{violation_id}/photos")
def get_violation_photos(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_violation(violation_id, current_user, db)
    photos = db.query(ViolationPhoto).filter(ViolationPhoto.violation_id == violation_id).order_by(ViolationPhoto.created_at.asc()).all()
    return [{"id": p.id, "data": p.data, "caption": p.caption, "created_at": p.created_at.isoformat()} for p in photos]


@app.delete("/violations/{violation_id}/photos/{photo_id}")
def delete_violation_photo(violation_id: int, photo_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    photo = db.query(ViolationPhoto).filter(ViolationPhoto.id == photo_id, ViolationPhoto.violation_id == violation.id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    add_system_note(db, violation, "Photo evidence removed")
    db.commit()
    return {"message": "Photo deleted"}


# -- Bulk import: violations from CSV (spreadsheet migration path) --

@app.post("/violations/import/csv")
async def import_violations_csv(hoa_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Columns: unit (required, matches an existing resident), type (required),
    description, priority, due_in_days, fine_amount. Extra columns ignored."""
    hoa = owned_hoa(hoa_id, current_user, db)
    try:
        contents = await file.read()
        text = contents.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        residents_by_unit = {
            (r.unit or "").strip().lower(): r
            for r in db.query(Resident).filter(Resident.hoa_id == hoa.id, Resident.archived_at.is_(None)).all()
        }
        added = 0
        errors = []
        for idx, row in enumerate(reader, 1):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            unit = row.get("unit") or row.get("address") or ""
            vtype = row.get("type") or row.get("violation_type") or ""
            if not unit or not vtype:
                errors.append(f"Row {idx}: missing required fields (unit, type)")
                continue
            resident = residents_by_unit.get(unit.lower())
            if not resident:
                errors.append(f"Row {idx}: no resident found for unit '{unit}' — import residents first")
                continue
            priority = row.get("priority", "").lower()
            if priority not in VALID_PRIORITIES:
                priority = "medium"
            try:
                due_days = int(float(row.get("due_in_days") or 14))
            except ValueError:
                due_days = 14
            due_days = due_days if due_days > 0 else 14
            try:
                fine = max(0.0, float(row.get("fine_amount") or 0))
            except ValueError:
                fine = 0.0
            violation = Violation(
                hoa_id=hoa.id, resident_id=resident.id, violation_type=vtype,
                description=row.get("description") or vtype, status="open", priority=priority,
                due_date=end_of_day(datetime.utcnow() + timedelta(days=due_days)), notice_level=0,
            )
            db.add(violation)
            db.flush()
            if fine > 0:
                db.add(ViolationFine(violation_id=violation.id, hoa_id=hoa.id, amount=fine, kind="assessment", note="Imported from CSV"))
            add_system_note(db, violation, f"Imported from CSV — {due_days}-day cure period")
            added += 1
        db.commit()
        return {"added": added, "errors": errors, "message": f"Successfully imported {added} violations"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


# -- Activity feed (recent enforcement activity across the HOA) --

@app.get("/hoas/{hoa_id}/activity")
def get_hoa_activity(hoa_id: int, limit: int = 15, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hoa = owned_hoa(hoa_id, current_user, db)
    limit = max(1, min(limit, 50))
    rows = (
        db.query(ViolationNote, Violation, Resident)
        .join(Violation, ViolationNote.violation_id == Violation.id)
        .join(Resident, Violation.resident_id == Resident.id)
        .filter(ViolationNote.hoa_id == hoa.id)
        .order_by(ViolationNote.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": note.id,
            "violation_id": violation.id,
            "violation_type": violation.violation_type,
            "resident_name": resident.name,
            "resident_unit": resident.unit,
            "body": note.body,
            "kind": note.kind,
            "created_at": note.created_at.isoformat(),
        }
        for note, violation, resident in rows
    ]


@app.delete("/violations/{violation_id}")
def delete_violation(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = owned_violation(violation_id, current_user, db)
    db.delete(violation)
    db.commit()
    return {"message": "Violation deleted"}


def _record_notice_sent(db: Session, violation: Violation, letter: str, via: str):
    """Snapshot the letter exactly as sent and advance the workflow. The
    snapshot is the audit record — later edits to the violation must never
    change what the resident was told."""
    violation.generated_letter = letter
    violation.email_sent_at = datetime.utcnow()
    if violation.status == "open":
        violation.status = "noticed"
    if (violation.notice_level or 0) == 0:
        violation.notice_level = 1
    add_system_note(db, violation, f"Violation notice emailed to resident ({via}) — letter archived")


@app.post("/violations/{violation_id}/mark-sent")
def mark_violation_sent(violation_id: int, body: Optional[MarkSentBody] = None,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Record a notice as sent without going through the server mailer — e.g.
    the manager delivered it by hand or through their own email client. The
    caller may pass the exact letter text so the archived copy matches what
    went out."""
    violation = owned_violation(violation_id, current_user, db)
    letter = (body.letter if body and body.letter else None) or build_letter_with_portal(violation, db)
    _record_notice_sent(db, violation, letter, via="email")
    db.commit()
    db.refresh(violation)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    return {"email_sent_at": violation.email_sent_at.isoformat(), "violation": serialize_violation(violation, resident, db=db)}


@app.post("/violations/{violation_id}/send-notice")
def send_violation_notice(violation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Server-side notice delivery. The server generates, sends (via the
    configured email provider — Brevo API or SMTP), and archives the letter in
    one transaction, so the audit record is authoritative. The From shows the
    HOA's name and replies route to the HOA's own address."""
    violation = owned_violation(violation_id, current_user, db)
    resident = db.query(Resident).filter(Resident.id == violation.resident_id).first()
    if not resident or not resident.email:
        raise HTTPException(status_code=400, detail="Resident has no email address")
    hoa = db.query(HOA).filter(HOA.id == violation.hoa_id).first()
    letter = build_letter_with_portal(violation, db)
    subject = f"{NOTICE_LEVELS[min(violation.notice_level or 0, len(NOTICE_LEVELS) - 1)] if violation.notice_level else 'Violation Notice'} — {violation.violation_type}"
    try:
        utils.send_email(
            to=resident.email,
            subject=f"{hoa.name if hoa else 'HOA'}: {subject}",
            body=letter,
            reply_to=(hoa.email if hoa else None),
            from_name=(hoa.name if hoa else None),
        )
    except LookupError:
        raise HTTPException(status_code=501, detail="No email provider is configured on the server")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {e}")
    _record_notice_sent(db, violation, letter, via="server")
    db.commit()
    db.refresh(violation)
    return {"email_sent_at": violation.email_sent_at.isoformat(), "violation": serialize_violation(violation, resident, db=db)}


if __name__ == "__main__":
    # Local development entry point: `python main.py`
    # (production uses a process manager that runs uvicorn directly)
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
