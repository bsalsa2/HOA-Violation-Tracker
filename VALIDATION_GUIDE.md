# Local Environment Validation Guide

Complete 5-part validation framework for local development and deployment.

## Quick Start

Run the basic validation (all 5 parts automatically):
```bash
bash scripts/validate_all.sh
```

For detailed step-by-step validation with server startup and testing:
```bash
bash scripts/validate_part_a_enhanced.sh
python3 scripts/validate_part_b_enhanced.py
bash scripts/validate_part_c_enhanced.sh
bash scripts/validate_part_d_enhanced.sh
python3 scripts/validate_part_e_enhanced.py
```

---

## Part A: Python Environment (Enhanced)

**What it does:** Sets up fresh venv, installs dependencies, starts server, tests health endpoint.

**Run:**
```bash
bash scripts/validate_part_a_enhanced.sh
```

**What it validates:**
- ✓ Python 3.11+ installed
- ✓ Virtual environment creation and activation
- ✓ Core dependencies (FastAPI, SQLAlchemy, pydantic-core, bcrypt)
- ✓ Server starts without errors
- ✓ Health endpoint responds (HTTP 200)
- ✓ Clean server shutdown

**Manual steps (if you prefer):**
```bash
# 1. Create fresh venv
python3.11 -m venv venv
source venv/bin/activate

# 2. Install exact versions
pip install -r requirements.txt

# 3. Verify imports
python -c "import bcrypt, pydantic_core, sqlalchemy, jwt; print('✓ Core deps')"

# 4. Start server
uvicorn main:app --reload

# 5. Test health (in another terminal)
curl http://127.0.0.1:8000/docs

# 6. Shutdown
# Ctrl+C
```

**Validates:** Python 3.11 compatibility, C extensions (bcrypt), binary compatibility (pydantic-core).

---

## Part B: Database + Schema (Enhanced)

**What it does:** Tests database connectivity, creates schema, validates full user flow.

**Run:**
```bash
python3 scripts/validate_part_b_enhanced.py
```

**What it validates:**
- ✓ Database connectivity (SQLite or PostgreSQL)
- ✓ Schema creation (all required tables)
- ✓ User creation and retrieval
- ✓ HOA creation and assignment
- ✓ Resident creation
- ✓ Violation creation and linking
- ✓ Transaction rollback and cleanup

**Manual steps (if you prefer):**
```bash
python << 'EOF'
from database import SessionLocal, engine, Base
from models import User, HOA, Resident, Violation

# Create tables
Base.metadata.create_all(bind=engine)
print('✓ Schema created')

# Test user flow
session = SessionLocal()

# Create user
user = User(email="test@example.com", hashed_password="...")
session.add(user)
session.commit()

# Create HOA
hoa = HOA(name="Test HOA", address="123 Main St", email="hoa@test.com", user_id=user.id)
session.add(hoa)
session.commit()

# Create resident
resident = Resident(hoa_id=hoa.id, unit="101", name="John Doe")
session.add(resident)
session.commit()

# Create violation
violation = Violation(hoa_id=hoa.id, resident_id=resident.id, issue_type="Noise", status="Draft", escalation_level=1)
session.add(violation)
session.commit()

print('✓ Full user flow working')
session.close()
EOF
```

**Validates:** SQLAlchemy ORM, database driver (sqlite/psycopg2), schema compatibility, transaction handling.

---

## Part C: Frontend Build (Enhanced)

**What it does:** Installs exact npm versions, builds React/Vite, verifies output.

**Run:**
```bash
bash scripts/validate_part_c_enhanced.sh
```

**What it validates:**
- ✓ Node.js version
- ✓ npm version
- ✓ Exact package versions from package-lock.json (npm ci)
- ✓ Key packages installed (React, React Router, Vite, Tailwind)
- ✓ Build completes without errors
- ✓ dist/ folder with HTML, JS, CSS assets

**Manual steps (if you prefer):**
```bash
cd frontend

# Install exact versions
npm ci  # Use lock file, not latest

# Build
npm run build

# Verify output
ls -la dist/
ls -la dist/assets/

# Check for errors
npm run build 2>&1 | grep -i error
```

**Validates:** Node version, npm modules, React/Vite build system, bundle generation.

---

## Part D: Full Integration Test (Enhanced)

**What it does:** Runs 37 pytest tests with both servers running.

**Requires:** Backend and frontend already running.

**Setup:**
```bash
# Terminal 1: Backend
source venv/bin/activate
uvicorn main:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Tests
bash scripts/validate_part_d_enhanced.sh
```

**What it validates:**
- ✓ All 37 API tests passing
- ✓ Authentication flow (register, login, logout)
- ✓ HOA management (create, edit, delete)
- ✓ Violation lifecycle (draft → sent → resolved)
- ✓ Resident import and export
- ✓ PDF generation
- ✓ Rate limiting
- ✓ Permission checks (user isolation)

**Validates:** API correctness, database transactions, authentication, permissions, PDF generation.

---

## Part E: Environment Variables (Enhanced)

**What it does:** Validates .env file with real values, tests database connection, checks deployment readiness.

**Run:**
```bash
python3 scripts/validate_part_e_enhanced.py
```

**What it validates:**
- ✓ .env file exists
- ✓ Required variables set (DATABASE_URL, SECRET_KEY)
- ✓ DATABASE_URL format (sqlite:// or postgresql://)
- ✓ PostgreSQL connectivity (if using PostgreSQL)
- ✓ SECRET_KEY strength
- ✓ Optional variables status (email, AI features)

**Example .env for local development:**
```bash
# Minimal (SQLite)
DATABASE_URL=sqlite:///./hoa_tracker.db
SECRET_KEY=local-dev-key-minimum-32-characters-required-1234567890ab

# Full (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/hoa_test
SECRET_KEY=your-production-secret-key-at-least-32-chars
FRONTEND_URL=http://localhost:3000
ADMIN_EMAIL=admin@test.com
BREVO_API_KEY=your-brevo-api-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

**Validates:** Critical deployment variables, database connectivity, configuration completeness.

---

## Validation Workflow

### Local Development
```
Part A (venv + server)
    ↓
Part B (database + schema)
    ↓
Part C (frontend build)
    ↓
Part D (full integration test)
    ↓
Ready to code!
```

### Before Deployment
```
Part E (environment variables)
    ↓
Update .env with real values
    ↓
Run Part A-D again with production config
    ↓
Ready to deploy!
```

---

## Troubleshooting

### Part A: Server won't start
```bash
# Check port is free
lsof -i :8000

# Check error log
tail -50 /tmp/uvicorn.log

# Try different port
uvicorn main:app --reload --port 8001
```

### Part B: Database connection fails
```bash
# Check DATABASE_URL in .env
echo $DATABASE_URL

# For SQLite: verify file path is writable
ls -l hoa_tracker.db

# For PostgreSQL: test connection
psql postgresql://user:pass@localhost/hoa_test
```

### Part C: Frontend build fails
```bash
# Clear cache and reinstall
rm -rf frontend/node_modules
rm frontend/package-lock.json
cd frontend && npm ci
npm run build
```

### Part D: Tests fail
```bash
# Check both servers are running
curl http://127.0.0.1:8000/docs
curl http://127.0.0.1:5173

# Run single test for details
pytest tests/test_api.py::test_register_rejects_bad_email -v

# Check database is clean
python scripts/validate_part_b_enhanced.py
```

### Part E: PostgreSQL connection fails
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list                 # macOS

# Test connection manually
psql -h localhost -U user -d hoa_test

# Check credentials in .env
grep DATABASE_URL .env
```

---

## Success Criteria

✅ **All validations pass** means:
- Python 3.11 with all dependencies installed
- Database schema created and working
- Frontend builds without errors
- All 37 API tests passing
- Environment variables configured

You're ready to:
- `uvicorn main:app --reload` (backend)
- `cd frontend && npm run dev` (frontend)
- Open `http://localhost:5173` in browser
- Start developing!

For deployment, ensure Part E passes with production values.
