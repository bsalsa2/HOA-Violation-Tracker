# Fly.io Deployment - Quick Start

## TL;DR (5 minutes)

```bash
# 1. Install & Login
brew install flyctl              # macOS
fly auth login                   # Opens browser

# 2. Launch app (creates fly.toml)
fly launch                       # Choose app name, region
                                # Decline Postgres, Redis

# 3. Edit fly.toml - add this to [env] section:
# PYTHON_VERSION = "3.11.9"
# PIP_CACHE_DIR = "/tmp/pip-cache"

# 4. Set secrets
fly secrets set DATABASE_URL="sqlite:///./hoa_tracker.db"
fly secrets set SECRET_KEY="your-secret-key-min-32-chars"

# 5. Build and deploy
cd frontend && npm run build && cd ..
bash scripts/deploy_fly.sh

# 6. Check it works
curl https://your-app.fly.dev/docs
```

---

## Step-by-Step

### 1. Install Fly CLI
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows/WSL
curl -L https://fly.io/install.sh | sh
```

### 2. Authenticate
```bash
fly auth login
# Opens browser → login → returns token
fly auth whoami  # Verify
```

### 3. Create App
```bash
fly launch
```
When prompted:
- **App name:** `hoa-tracker-yourname` (unique)
- **Region:** Pick closest (e.g., `sjc` for West Coast)
- **Postgres:** NO
- **Redis:** NO

Creates `fly.toml`.

### 4. Configure fly.toml

Edit `fly.toml`, add to `[env]` section:
```toml
[env]
  PYTHON_VERSION = "3.11.9"
  PIP_CACHE_DIR = "/tmp/pip-cache"
```

### 5. Check Dockerfile

Ensure line 1 is:
```dockerfile
FROM python:3.11.9-slim
```

Not just `python:3.11-slim` or `python:3.11.x`.

### 6. Set Secrets
```bash
# Required
fly secrets set DATABASE_URL="sqlite:///./hoa_tracker.db"
fly secrets set SECRET_KEY="min-32-char-random-string"

# Optional (for email)
fly secrets set BREVO_API_KEY="your-key"
```

Verify:
```bash
fly secrets list
```

### 7. Build Frontend
```bash
cd frontend
npm run build
cd ..
```

Verify `frontend/dist` exists and has files.

### 8. Deploy
```bash
bash scripts/deploy_fly.sh
```

Fully automated deployment with validation.

### 9. Test
```bash
# Should return 200
curl https://your-app.fly.dev/docs

# Check logs
fly logs

# View status
fly status
```

---

## Common Commands

```bash
# Monitor
fly logs              # View live logs
fly status            # Check app status
fly machine list      # View machines

# Configure
fly secrets set VAR=value       # Set env var
fly secrets list                # List all env vars
fly config show                 # Show fly.toml

# Scale
fly scale count 2     # Run 2 instances
fly scale vm standard # Use bigger machine

# SSH & Debug
fly ssh console       # SSH into container
fly ssh sftp shell    # File access

# Releases
fly releases          # Deployment history
fly releases rollback # Undo last deployment

# Cleanup
fly destroy           # Delete app
```

---

## Troubleshooting

### App won't start
```bash
fly logs
# Look for error message, usually:
# - Missing environment variable
# - Database connection failed
# - Port not available
```

### "Database connection refused"
```bash
# Check DATABASE_URL is set correctly
fly secrets list | grep DATABASE

# Test connection
fly ssh console
# Inside container:
python3 << 'EOF'
from sqlalchemy import create_engine
engine = create_engine(os.getenv('DATABASE_URL'))
print(engine.connect())
EOF
```

### Build fails
```bash
fly build
# Check error, usually:
# - pip install failed → missing dependency
# - npm build failed → check frontend build locally
# - space issues → increase machine size

fly scale vm shared-cpu-2x  # Bigger machine
```

### App crashes after deploy
```bash
fly logs -n 100
fly machine restart <machine-id>
fly releases rollback
```

### "Port already in use"
App is using port 8000. Check `fly.toml`:
```toml
[http_service]
  internal_port = 8000
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `fly.toml` | Fly.io configuration (created by `fly launch`) |
| `Dockerfile` | Docker build config (must use Python 3.11.9-slim) |
| `frontend/dist` | Built React app (must exist before deploy) |
| `FLY_DEPLOYMENT_GUIDE.md` | Complete guide |
| `scripts/deploy_fly.sh` | Automated deployment |
| `scripts/troubleshoot_fly.sh` | Troubleshooting menu |

---

## Success Checklist

- ✅ Fly CLI installed and authenticated
- ✅ `fly launch` completed
- ✅ `fly.toml` has Python 3.11.9 and cache settings
- ✅ Dockerfile uses `python:3.11.9-slim`
- ✅ `fly secrets set` for DATABASE_URL and SECRET_KEY
- ✅ Frontend built (`npm run build`)
- ✅ `scripts/deploy_fly.sh` succeeds
- ✅ Health check returns 200
- ✅ Can login and access app

---

## Deployed! 🎉

Your app is live at: `https://your-app.fly.dev`

Next:
- Add custom domain: `fly certs add yourdomain.com`
- Set up monitoring: `fly logs`
- Configure email: Set `BREVO_API_KEY`
- Enable auto-scaling: `fly scale count 2`

Read full guide: `FLY_DEPLOYMENT_GUIDE.md`
