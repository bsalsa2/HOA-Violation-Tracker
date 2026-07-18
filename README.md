# ViolationTrack — HOA Violation Tracker

Modern violation management for property managers and HOA boards. Track violations across a portfolio of communities, send professional notice letters, escalate through a formal notice ladder, and keep a defensible audit trail — without spreadsheets.

## What sets it apart

- **Resident Response Portal** — every notice carries a secure link (no account needed) where the resident sees their case, the evidence on file, the deadline countdown, and the fine balance — and can respond: *"I've corrected it"*, *"I dispute this"*, or ask a question. Responses land directly on the case's official record and are flagged for the manager. Enforcement becomes a documented two-way conversation instead of a one-way letter.
- **Hearing-Ready Case Files** — one click exports the complete case as a single PDF: summary, fine ledger, the full audit timeline (including resident responses), the notice exactly as it was sent, and every photo as a numbered exhibit. Built for board packets and attorney handoffs.

## Features

**Enforcement workflow**
- Full violation lifecycle: open → noticed → escalated → resolved, with end-of-day cure deadlines and overdue tracking (escalating a resolved case reopens it)
- Industry-standard notice ladder: Courtesy Notice → First → Second → Final Notice → Hearing / Legal
- Repeat-offense detection — a second violation of the same type within 12 months is badged in the UI and cited in the letter
- True fine ledger: stacking assessments and partial payments with a running balance (overpayments rejected), not just a single amount + paid flag
- Photo evidence: attach inspection photos to any violation; letters cite the evidence on file
- Residents who move out are **archived, never erased** — their violation history survives for disputes, liens, and resale disclosures (restore anytime; active units are unique per community)
- Immutable audit trail on every case: every status change, fine, payment, escalation, note, and sent notice is logged

**Letters & notices**
- Professional violation letters generated per case — property address, cure deadline, notice level, fines, repeat-offense and evidence clauses
- **Sent letters are archived verbatim**: the exact text emailed to the resident is snapshotted and can never be altered by later edits — view or PDF the "as sent" copy anytime
- Server-side delivery through a transactional email provider (Brevo API, or SMTP) — the letter is sent and archived in one transaction. Notices show the HOA's name as the sender and route replies to the HOA's own address
- Optional AI drafting via Google Gemini (falls back to a built-in template)
- Print-ready PDF letters (1" margins, US Letter) for certified mail — draft or as-sent version
- Send confirmation with recipient preview — no accidental notices

**Portfolio & reporting**
- Manage multiple HOAs/communities under one account, with per-community contact branding
- Overview dashboard: KPIs, "Needs Attention" triage queue (overdue and due-soon), recent activity feed
- Board-ready violation report with a six-month enforcement trend chart (print/save as PDF)
- CSV export of the violation log; CSV import for residents *and* violations (spreadsheet migration path)
- One-click sample community for evaluating the product
- ⌘K command palette for everything
- Deep-linkable URLs — every community, tab, and open violation has an address you can bookmark or paste into board minutes

**Account security & access**
- Invite-only registration: the operator mints single-use signup links (one per paying customer); visitors without a link are pointed to contact for access
- Admin operator (`ADMIN_EMAIL`) sees and manages every HOA; regular managers see only their own
- In-app change password, plus self-service reset via emailed 30-minute links (requires an email provider — Brevo or SMTP)
- Login rate limiting (10 failed attempts / 15 minutes)
- 8-character password minimum, email validation, enumeration-safe responses

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy 2 |
| Database | PostgreSQL (production) / SQLite (local dev) |
| Auth | JWT (Bearer), bcrypt password hashing |
| Email | Brevo transactional API (server-side) with SMTP fallback |
| Letters | Gemini (optional) + template fallback, ReportLab PDFs |

## Local development

**Backend**

```bash
pip install -r requirements.txt
uvicorn main:app --reload            # SQLite ./hoa_tracker.db by default
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Point the frontend at your API with `VITE_API_BASE` (defaults to the production URL):

```bash
VITE_API_BASE=http://localhost:8000 npm run dev
```

**Tests**

```bash
pip install -r requirements-dev.txt
pytest tests/ -q
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | prod | Postgres connection string (SQLite fallback for dev) |
| `SECRET_KEY` | prod | JWT signing secret (`JWT_SECRET` also accepted) |
| `CORS_ORIGINS` | no | Comma-separated allowed origins (default `*`) |
| `ADMIN_EMAIL` | no | Operator account — bootstraps as admin and registers without an invite code (default `violationtrack.notices@gmail.com`) |
| `GEMINI_API_KEY` | no | Enables AI-drafted letters |
| `GEMINI_MODEL` | no | Override letter model (default `gemini-2.0-flash`) |
| `BREVO_API_KEY` | no | Enables email (notices + password reset) via Brevo's HTTPS API |
| `BREVO_SENDER_EMAIL` | no | Verified Brevo sender address (defaults to `SMTP_FROM`) |
| `BREVO_SENDER_NAME` | no | Default From name; each notice overrides it with the HOA's name |
| `SMTP_HOST` / `SMTP_PORT` | no | SMTP fallback (used only when `BREVO_API_KEY` is empty) |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials |
| `SMTP_FROM` | no | From address (defaults to `SMTP_USER`) |
| `SMTP_SSL` / `SMTP_STARTTLS` | no | TLS mode (STARTTLS on port 587 by default) |
| `FRONTEND_URL` | no | Base URL used in password-reset links |

> **Email setup (free):** Sign up at [brevo.com](https://www.brevo.com) (free tier: 300 emails/day), verify a sender email (no domain required — you just click a confirmation link), create an API key, and set `BREVO_API_KEY` + `BREVO_SENDER_EMAIL`. Notices show the HOA's name as the sender with replies routed to the HOA's own email. Without an email provider, notice sending returns a clear "not configured" error and password-reset emails can't be delivered.
>
> **Why not plain SMTP?** Render and Railway free tiers block outbound SMTP ports (25/465/587). Brevo sends over HTTPS (port 443), so it works there; the SMTP path is only for hosts where those ports are open.

Frontend (Vite):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | API base URL |

> Email is sent entirely server-side, so the frontend needs no email configuration.

## Deployment

- **Backend** — any Python host (Railway/Render; a `Procfile` and `render.yaml` are included). Set `DATABASE_URL`, `SECRET_KEY`, `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` (for email), and optionally `CORS_ORIGINS` to your frontend origin. Schema migrations run automatically at startup.
- **Frontend** — static Vite build (`npm run build` → `dist/`) on Vercel/Netlify. Set `VITE_API_BASE` at build time.

## CSV formats

Residents:

```csv
name,unit,email,phone
Jane Smith,101,jane@example.com,555-1234
```

Violations (rows are matched to residents by `unit` — import residents first):

```csv
unit,type,description,priority,due_in_days,fine_amount
101,Parking Violation,Truck in guest spot,high,14,25
```

## License

MIT — see [LICENSE](LICENSE).
