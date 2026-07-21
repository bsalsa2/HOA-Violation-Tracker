# Local Environment Validation

This directory contains a 5-part validation framework to ensure your local environment is properly configured for HOA Violation Tracker development.

## Running the Full Validation

Execute all validations at once:

```bash
bash scripts/validate_all.sh
```

This will check all 5 parts and provide a summary. If all pass, you're ready to start development.

## Individual Validations

Each part can be run independently:

### Part A: Python Environment
```bash
bash scripts/validate_python_env.sh
```
Checks Python 3.11+ is installed with required dependencies (FastAPI, SQLAlchemy, etc).

### Part B: Database Schema
```bash
python3 scripts/validate_database_schema.py
```
Validates database connectivity and creates tables if needed (users, hoas, residents, violations).

### Part C: Frontend Build
```bash
bash scripts/validate_frontend_build.sh
```
Checks Node.js/npm, installs dependencies, and verifies the frontend builds successfully.

### Part D: Integration Tests
```bash
bash scripts/validate_integration_tests.sh
```
Runs the full pytest suite (37 tests covering API, auth, violations, etc).

### Part E: Environment Configuration
```bash
python3 scripts/validate_env_config.py
```
Validates `.env` file exists with required variables (DATABASE_URL, SECRET_KEY).

## Setup for First Time

1. **Copy example environment:** `cp .env.example .env`
2. **Update DATABASE_URL** (if not using SQLite):
   - SQLite (local dev): `sqlite:///./hoa_tracker.db`
   - PostgreSQL: `postgresql://user:pass@localhost/hoa_tracker`
3. **Run validation:** `bash scripts/validate_all.sh`

## Environment Variables

**Required for local development:**
- `DATABASE_URL` - Database connection string
- `SECRET_KEY` - JWT signing secret

**Optional (email/AI features):**
- `BREVO_API_KEY` - Email delivery via Brevo
- `GEMINI_API_KEY` - AI-drafted violation letters
- `ADMIN_EMAIL` - Bootstrap admin account

## Starting Development

Once validation passes:

```bash
# Terminal 1: Backend
python3 main.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

Then open `http://localhost:5173` in your browser.

## Troubleshooting

- **Python dependencies missing:** Run `pip install -r requirements.txt`
- **Database connection fails:** Ensure DATABASE_URL is correct; SQLite doesn't require a running server
- **Frontend build fails:** Run `cd frontend && npm install`
- **Tests fail:** Check database is initialized; if issues persist, delete `.pytest_cache` and retry
