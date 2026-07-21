# Fly.io Deployment Guide

Complete step-by-step guide to deploy HOA Violation Tracker to Fly.io.

## Prerequisites

- Fly.io account (https://fly.io)
- Fly CLI installed
- Project validated locally (run `bash scripts/validate_all.sh`)

---

## Step 1: Install Fly CLI & Authenticate

### 1a. Install Fly CLI
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows (WSL)
curl -L https://fly.io/install.sh | sh
```

### 1b. Authenticate with Fly.io
```bash
fly auth login
```
Opens browser to login. Copy the token back to terminal.

Verify:
```bash
fly auth whoami
```

---

## Step 2: Create Fly App Configuration

### 2a. Launch Fly app (creates fly.toml)
```bash
# From project root
fly launch
```

When prompted:
- **App name:** Choose something unique (e.g., `hoa-tracker-yourname`)
- **Region:** Pick closest to your users (e.g., `sjc` for SF, `ord` for Chicago)
- **Postgres database:** Say **NO** (we'll use SQLite or external DB)
- **Redis:** Say **NO**

Result: Creates `fly.toml` in project root.

### 2b. Edit fly.toml

```toml
app = "hoa-tracker-yourname"
primary_region = "sjc"

[build]
  builder = "pacer"
  
[env]
  PYTHON_VERSION = "3.11.9"              # CRITICAL: Explicit version
  PIP_CACHE_DIR = "/tmp/pip-cache"       # Prevent space issues

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[statics]]
  guest_path = "/app/frontend/dist"
  url_path = "/static"

[[services]]
  protocol = "tcp"
  internal_port = 8000
  
  [[services.ports]]
    port = 443
    handlers = ["http"]
  
  [[services.ports]]
    port = 80
    handlers = ["http"]
```

**Key settings:**
- `PYTHON_VERSION = "3.11.9"` - Locks exact version (avoid generic 3.11)
- `PIP_CACHE_DIR = "/tmp/pip-cache"` - Prevents disk space errors
- `force_https = true` - Enforce HTTPS
- `min_machines_running = 1` - Always keep instance alive

---

## Step 3: Update Dockerfile

Verify `Dockerfile` uses exact Python version:

```dockerfile
FROM python:3.11.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Copy frontend build
COPY frontend/dist /app/frontend/dist

# Expose port
EXPOSE 8000

# Start server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Critical points:**
- `python:3.11.9-slim` (exact version, not just `3.11`)
- Copy frontend dist for static files
- Expose port 8000
- Use `--host 0.0.0.0` for container networking

---

## Step 4: Test Build Locally

Before deploying, test the Docker build:

```bash
fly build
```

Wait for build to complete. You'll see:
```
...
Step X/Y ...
...
Successfully tagged flyio/app:latest
```

If it fails:
```bash
# Check build output
fly logs --build
```

---

## Step 5: Set Environment Variables

Add secrets (sensitive config) to Fly:

```bash
# Database URL (if using external PostgreSQL)
fly secrets set DATABASE_URL="postgresql://user:pass@host:5432/db"

# JWT Secret
fly secrets set SECRET_KEY="your-production-secret-key-min-32-chars"

# Optional: Email config
fly secrets set BREVO_API_KEY="your-brevo-api-key"
fly secrets set BREVO_SENDER_EMAIL="noreply@yourdomain.com"

# Optional: Gemini API for AI features
fly secrets set GEMINI_API_KEY="your-gemini-api-key"

# Environment
fly secrets set ENVIRONMENT="production"
fly secrets set FRONTEND_URL="https://your-app.fly.dev"
```

Verify secrets:
```bash
fly secrets list
```

---

## Step 6: Deploy to Fly.io

### 6a. Build frontend first

```bash
cd frontend
npm run build
cd ..
```

Verify `frontend/dist` exists with files.

### 6b. Deploy to Fly

```bash
fly deploy
```

Watch the output:
```
==> Creating release
Release v1 created
...
==> Monitoring Deployment
...
1 desired, 1 running

Visit your newly deployed app at https://[your-app].fly.dev/
```

If deployment fails:
```bash
# Check logs
fly logs

# Check machine status
fly machine list

# Restart if stuck
fly machine restart <machine-id>
```

---

## Step 7: Test Deployed App

### 7a. Health check endpoint

```bash
# Should return 200 OK
curl https://your-app.fly.dev/docs

# API health check (if implemented)
curl https://your-app.fly.dev/health
```

### 7b. Test database connectivity

Try a GET endpoint that queries database:

```bash
# Get HOA list (requires auth token)
curl -H "Authorization: Bearer <token>" \
  https://your-app.fly.dev/api/hoas

# Or test without auth (login endpoint)
curl https://your-app.fly.dev/api/auth/login
```

### 7c. Test in browser

Open in browser: `https://your-app.fly.dev`

Should see login page (if frontend built correctly).

---

## Step 8: Configure Custom Domain (Optional)

Add your custom domain:

```bash
fly certs add yourdomain.com
fly certs add www.yourdomain.com
```

Add CNAME records to your DNS provider:
```
yourdomain.com    CNAME  your-app.fly.dev
www.yourdomain.com  CNAME  your-app.fly.dev
```

---

## Troubleshooting

### Build fails locally

```bash
# Check Docker is running
docker ps

# View detailed build log
fly build --local-only

# Compare to local validation
bash scripts/validate_all.sh
```

### Deployment succeeds but app doesn't respond

```bash
# Check app is actually running
fly machine list

# Check logs
fly logs
fly logs -n 100  # Last 100 lines

# SSH into running machine
fly ssh console

# Inside machine:
curl http://localhost:8000/docs
ps aux | grep uvicorn
```

### Database connection error on Fly but works locally

```bash
# Check environment variables
fly secrets list

# Verify DATABASE_URL
fly ssh console
echo $DATABASE_URL

# Test connection inside machine
python3 << 'EOF'
import os
from sqlalchemy import create_engine, text

db_url = os.getenv('DATABASE_URL')
print(f"URL: {db_url}")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("✓ Connection successful")
except Exception as e:
    print(f"✗ Error: {e}")
EOF
```

### Out of disk space during build

The `PIP_CACHE_DIR = "/tmp/pip-cache"` setting should prevent this. If still happening:

```bash
# Rebuild without cache
fly deploy --remote-only
```

### App crashes after deploy

```bash
# Get machine ID
fly machine list

# Check recent logs
fly logs -n 50

# Restart machine
fly machine restart <id>

# If still crashing, rollback
fly releases
fly releases rollback
```

---

## Monitoring & Maintenance

### View logs in real-time
```bash
fly logs
```

### Check app metrics
```bash
fly status
```

### Scale instances
```bash
# Run 2 instances for high availability
fly scale count 2

# Reduce to 1
fly scale count 1
```

### Update app
```bash
# Make code changes, rebuild frontend
cd frontend && npm run build && cd ..

# Redeploy
fly deploy
```

### View deployment history
```bash
fly releases
```

---

## Cost Notes

**Fly.io Pricing:**
- Always Free tier: 3 shared-cpu-1x 256MB VMs
- Our app fits on 1x shared VM (~$5-10/month after free credits)
- Database: SQLite uses app's filesystem, no extra cost
- If using PostgreSQL: ~$10/month for tiny instance

**Optimize costs:**
```bash
# Use 1 instance
fly scale count 1

# Use shared CPU (cheaper)
# Already default

# Enable auto-stop (stop when idle)
# Already in fly.toml
```

---

## Useful Commands Reference

```bash
# Status
fly status
fly logs
fly machine list

# Deploy
fly deploy
fly build

# Configuration
fly secrets set VAR=value
fly secrets list
fly config show

# SSH & debugging
fly ssh console
fly ssh sftp shell

# Scaling
fly scale count 2
fly scale vm shared-cpu-1x

# Releases & rollback
fly releases
fly releases rollback

# Cleanup
fly destroy [app-name]  # Delete app entirely
```

---

## Success Checklist

- ✅ Fly.io account created and CLI authenticated
- ✅ `fly launch` ran successfully
- ✅ `fly.toml` edited with Python 3.11.9 and cache settings
- ✅ Dockerfile has correct Python version
- ✅ Frontend built (`npm run build`)
- ✅ `fly build` succeeds locally
- ✅ Environment variables set with `fly secrets set`
- ✅ `fly deploy` completes successfully
- ✅ Health endpoint responds (HTTP 200)
- ✅ Database queries work
- ✅ Browser shows login page

Once all checked, your app is live! 🎉

---

## Next Steps

1. **Custom domain** - Add your domain via DNS CNAME
2. **Email configuration** - Set up BREVO_API_KEY for notifications
3. **Monitoring** - Set up log aggregation (Papertrail, etc.)
4. **Backups** - If using PostgreSQL, enable automated backups
5. **CI/CD** - Automate `fly deploy` on git push (GitHub Actions)
