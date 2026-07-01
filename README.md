# ViolationTrack — HOA Violation Tracker

Modern violation management for property managers and HOA boards. Track violations across a portfolio of communities, send professional notice letters, escalate through a formal notice ladder, and keep a defensible audit trail — without spreadsheets.

## Features

**Enforcement workflow**
- Full violation lifecycle: open → noticed → escalated → resolved, with cure-date deadlines and overdue tracking
- Industry-standard notice ladder: Courtesy Notice → First → Second → Final Notice → Hearing / Legal
- Repeat-offense detection — a second violation of the same type within 12 months is flagged automatically and cited in the letter
- Fine ledger per violation (assessed / paid / outstanding)
- Photo evidence: attach inspection photos to any violation; letters cite the evidence on file
- Immutable audit trail on every case: every status change, fine, escalation, note, and sent notice is logged

**Letters & notices**
- Professional violation letters generated per case — property address, cure deadline, notice level, fines, repeat-offense and evidence clauses
- Optional AI drafting via Google Gemini (falls back to a built-in template)
- Email delivery via EmailJS with the HOA's own name and reply-to
- Print-ready PDF letters (1" margins, US Letter) for certified mail
- Send confirmation with recipient preview — no accidental notices

**Portfolio & reporting**
- Manage multiple HOAs/communities under one account, with per-community contact branding
- Overview dashboard: KPIs, "Needs Attention" triage queue (overdue and due-soon), recent activity feed, top residents
- Board-ready compliance report (print/save as PDF)
- CSV export of the violation log; CSV import for residents *and* violations (spreadsheet migration path)
- One-click sample community for evaluating the product
- ⌘K command palette for everything

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy 2 |
| Database | PostgreSQL (production) / SQLite (local dev) |
| Auth | JWT (Bearer), bcrypt password hashing |
| Email | EmailJS (client-side send) |
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
| `GEMINI_API_KEY` | no | Enables AI-drafted letters |
| `GEMINI_MODEL` | no | Override letter model (default `gemini-2.0-flash`) |

Frontend (Vite):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | API base URL |
| `VITE_EJS_SERVICE` / `VITE_EJS_TEMPLATE` / `VITE_EJS_KEY` | EmailJS service, template, and public key for sending notices |

> **EmailJS note:** the actual sending address is whichever account you connect in the EmailJS dashboard. The app sets the HOA's name and email as the from-name/reply-to template variables — map them to `{{from_name}}` / `{{reply_to}}` in your EmailJS template.

## Deployment

- **Backend** — any Python host (Railway/Render; a `Procfile` and `render.yaml` are included). Set `DATABASE_URL`, `SECRET_KEY`, and optionally `CORS_ORIGINS` to your frontend origin. Schema migrations run automatically at startup.
- **Frontend** — static Vite build (`npm run build` → `dist/`) on Vercel/Netlify. Set `VITE_API_BASE` and the EmailJS variables at build time.

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
