# Complete Deployment Workflow

End-to-end guide for deploying HOA Violation Tracker from local development to production on Fly.io.

---

## Phase 1: Local Development & Validation

### 1a. Initial Setup
```bash
# Clone repository (already done)
cd HOA-Violation-Tracker

# Run local validation
bash scripts/validate_all.sh
```

**Validates:**
- Python 3.11 environment
- Database schema (SQLite)
- Frontend build
- 37 integration tests
- Environment configuration

### 1b. Development Workflow
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

**Access:**
- Backend: http://localhost:8000/docs
- Frontend: http://localhost:5173
- Database: hoa_tracker.db (SQLite)

### 1c. Build Frontend for Production
```bash
cd frontend
npm run build
```

Creates `frontend/dist` with optimized React bundle.

---

## Phase 2: Prepare for Deployment

### 2a. Choose Deployment Target

**Option A: Fly.io (Recommended)**
- Cost: ~$5-10/month on free tier
- Uptime: 99.9%
- Database: SQLite (built-in) or PostgreSQL
- Setup time: 15 minutes

**Option B: Render.com**
- Cost: $7-12/month
- Easy GitHub integration
- Database: PostgreSQL
- Setup time: 20 minutes

**Option C: Railway.app**
- Cost: $5-20/month
- Straightforward deployment
- Database: PostgreSQL
- Setup time: 15 minutes

### 2b. Create Production Database

**If using SQLite:**
No additional setup needed. App uses `hoa_tracker.db`.

**If using PostgreSQL:**
```bash
# Locally test with PostgreSQL
DATABASE_URL="postgresql://user:pass@localhost/hoa_tracker" python main.py

# On Fly.io: Use managed Postgres
fly postgres create --name hoa-postgres
fly postgres attach hoa-postgres
```

### 2c. Prepare Environment Variables

Create `.env.production`:
```bash
# Required
DATABASE_URL=sqlite:///./hoa_tracker.db  # or postgresql://...
SECRET_KEY=production-secret-min-32-characters-random-string

# Email (optional but recommended)
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=HOA Violation Tracker

# AI features (optional)
GEMINI_API_KEY=your-gemini-api-key

# Domain
FRONTEND_URL=https://yourdomain.com
ENVIRONMENT=production
```

Generate random SECRET_KEY:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Phase 3: Deploy to Fly.io

### 3a. Install Fly CLI & Authenticate
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login
fly auth whoami
```

### 3b. Create Fly App
```bash
fly launch
```

Prompts:
- **App name:** e.g., `hoa-tracker-prod`
- **Region:** Choose closest to users
- **Postgres:** NO (we use SQLite or external DB)
- **Redis:** NO

Creates `fly.toml`.

### 3c. Configure fly.toml

Use template:
```bash
cp fly.toml.template fly.toml
```

Edit `fly.toml` and update:
```toml
app = "your-app-name"
primary_region = "your-region"  # sjc, lhr, iad, etc.
```

Key settings (already configured):
- `PYTHON_VERSION = "3.11.9"` - Explicit version
- `PIP_CACHE_DIR = "/tmp/pip-cache"` - Space optimization
- `force_https = true` - HTTPS enforced
- `min_machines_running = 1` - Always on

### 3d. Set Environment Secrets
```bash
fly secrets set DATABASE_URL="sqlite:///./hoa_tracker.db"
fly secrets set SECRET_KEY="your-production-secret"

# Optional
fly secrets set BREVO_API_KEY="your-key"
fly secrets set GEMINI_API_KEY="your-key"
fly secrets set FRONTEND_URL="https://yourdomain.com"
```

Verify:
```bash
fly secrets list
```

### 3e. Automated Deployment
```bash
# Full deployment with validation
bash scripts/deploy_fly.sh
```

This script:
1. ✓ Validates prerequisites
2. ✓ Runs local tests
3. ✓ Builds frontend
4. ✓ Tests Docker build
5. ✓ Deploys to Fly.io
6. ✓ Tests deployed app
7. ✓ Shows success summary

### 3f. Manual Deployment (if needed)
```bash
# Build frontend
cd frontend && npm run build && cd ..

# Test Docker build
fly build

# Deploy
fly deploy

# Monitor
fly logs
fly status
```

---

## Phase 4: Test Deployed App

### 4a. Check App is Running
```bash
fly status
fly machine list
```

### 4b. Test Health Endpoint
```bash
curl https://your-app.fly.dev/docs
# Should return 200 OK with Swagger UI

curl https://your-app.fly.dev/health
# Should return 200 with health status
```

### 4c. Test in Browser
```
https://your-app.fly.dev/
```

Should show login page. Try login with test credentials.

### 4d. Test Database Connection
```bash
# Inside Fly console
fly ssh console

# Test Python import
python3 << 'EOF'
from database import SessionLocal
from models import User

session = SessionLocal()
users = session.query(User).all()
print(f"✓ Database working. Users: {len(users)}")
EOF
```

### 4e. Test API Endpoints
```bash
# Get status
curl https://your-app.fly.dev/api/auth/status

# Try login
curl -X POST https://your-app.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test"}'
```

---

## Phase 5: Configure Custom Domain (Optional)

### 5a. Add Domain to Fly
```bash
fly certs add yourdomain.com
fly certs add www.yourdomain.com
```

Returns DNS instructions.

### 5b. Update DNS Provider

Add CNAME records:
```
yourdomain.com    CNAME  your-app.fly.dev
www.yourdomain.com CNAME  your-app.fly.dev
```

Wait for DNS propagation (10-30 minutes).

### 5c. Verify
```bash
curl https://yourdomain.com
```

---

## Phase 6: Post-Deployment

### 6a. Monitoring
```bash
# View live logs
fly logs

# Check status
fly status

# View machine list
fly machine list

# View performance metrics
fly scale show
```

### 6b. Scaling
```bash
# Run 2 instances for redundancy
fly scale count 2

# Use larger machine
fly scale vm performance-2x
```

### 6c. Updates
```bash
# Make code changes
git commit -am "Fix something"

# Build and deploy
cd frontend && npm run build && cd ..
fly deploy
```

### 6d. Troubleshooting
```bash
# Interactive troubleshooting menu
bash scripts/troubleshoot_fly.sh

# Or manual:
fly logs -n 100           # Last 100 log lines
fly ssh console           # SSH into container
fly machine restart <id>  # Restart machine
fly releases rollback     # Undo last deploy
```

---

## Verification Checklist

### Pre-Deployment
- ✅ `bash scripts/validate_all.sh` passes all 5 parts
- ✅ Frontend builds: `npm run build` creates dist/
- ✅ Local server runs: `uvicorn main:app`
- ✅ Integration tests pass: `pytest tests/`

### Fly.io Setup
- ✅ Fly CLI installed and authenticated
- ✅ `fly.toml` created and configured
- ✅ Python 3.11.9 specified in fly.toml
- ✅ Environment secrets set

### Deployment
- ✅ `scripts/deploy_fly.sh` completes successfully
- ✅ `fly deploy` succeeds
- ✅ `fly status` shows "deployed"
- ✅ No errors in `fly logs`

### Testing
- ✅ `curl https://app.fly.dev/docs` returns 200
- ✅ Login page displays
- ✅ Can create account
- ✅ Can create HOA
- ✅ Database queries work
- ✅ Can view violations

### Production Ready
- ✅ HTTPS enforced
- ✅ Error logs monitored
- ✅ Database backups configured
- ✅ Custom domain setup (if desired)
- ✅ Email configured (if desired)

---

## Quick Reference Commands

```bash
# Setup
fly auth login
fly launch
fly secrets set VAR=value

# Build & Deploy
cd frontend && npm run build && cd ..
bash scripts/deploy_fly.sh

# Monitor
fly logs
fly status
fly machine list

# Debug
bash scripts/troubleshoot_fly.sh
fly ssh console
fly logs -n 100

# Scale
fly scale count 2

# Rollback
fly releases
fly releases rollback

# Cleanup
fly destroy
```

---

## Cost Breakdown

**Fly.io Free Tier:**
- 3x shared-cpu-1x VMs with 256MB RAM (free)
- 160GB of included Outbound Data Transfer
- Postgresql: Requires paid tier (~$15/month)

**Our Setup:**
- 1x shared-cpu machine: FREE (within free tier)
- SQLite database: FREE (stored on machine)
- Outbound data: FREE (<160GB)
- **Total: $0/month** (on free tier, within limits)

**Recommended for production:**
- 2x machines for redundancy: ~$5-10/month
- PostgreSQL database (if needed): ~$15/month
- **Total: $20-25/month**

---

## Success! 🎉

Your app is now live at:
```
https://your-app.fly.dev
https://yourdomain.com (if custom domain added)
```

**Next steps:**
1. Test with real data
2. Invite team members
3. Configure email notifications
4. Set up monitoring alerts
5. Plan backups (if using Postgres)

**Resources:**
- Guide: `FLY_DEPLOYMENT_GUIDE.md`
- Quick start: `FLY_QUICK_START.md`
- Validation: `VALIDATION_GUIDE.md`
- Troubleshooting: Run `bash scripts/troubleshoot_fly.sh`
