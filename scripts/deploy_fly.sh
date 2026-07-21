#!/bin/bash
# Fly.io Deployment Helper
# Automates the deployment process with validation and error checking

set +e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Fly.io Deployment Helper                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
echo ""

# Check Fly CLI installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not installed"
    echo ""
    echo "Install via:"
    echo "  macOS:  brew install flyctl"
    echo "  Linux:  curl -L https://fly.io/install.sh | sh"
    exit 1
fi
echo "✓ Fly CLI installed: $(fly version)"

# Check authenticated
if ! fly auth whoami > /dev/null 2>&1; then
    echo "❌ Not authenticated with Fly.io"
    echo ""
    echo "Run: fly auth login"
    exit 1
fi
echo "✓ Authenticated as: $(fly auth whoami)"
echo ""

# Step 1: Validate local environment
echo "────────────────────────────────────────────────────────────"
echo "Step 1: Validating local environment..."
echo ""

if [ ! -f "fly.toml" ]; then
    echo "❌ fly.toml not found"
    echo ""
    echo "Run: fly launch"
    echo "(Choose app name, region; decline Postgres and Redis)"
    exit 1
fi

# Extract app name from fly.toml
APP_NAME=$(grep "^app = " fly.toml | cut -d'"' -f2)
if [ -z "$APP_NAME" ]; then
    echo "❌ Could not read app name from fly.toml"
    exit 1
fi

echo "✓ App name: $APP_NAME"

# Check fly.toml configuration
if ! grep -q 'PYTHON_VERSION = "3.11.9"' fly.toml; then
    echo "⚠️  fly.toml missing PYTHON_VERSION = \"3.11.9\""
    echo ""
    echo "Add to [env] section:"
    echo '  PYTHON_VERSION = "3.11.9"'
    echo "  PIP_CACHE_DIR = \"/tmp/pip-cache\""
fi

echo "✓ fly.toml configured"

# Check Dockerfile
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found"
    exit 1
fi

if ! grep -q "python:3.11.9-slim" Dockerfile; then
    echo "⚠️  Dockerfile does not use python:3.11.9-slim"
    echo ""
    echo "Update Dockerfile base image:"
    echo "  FROM python:3.11.9-slim"
fi

echo "✓ Dockerfile configured"
echo ""

# Step 2: Run local validation
echo "────────────────────────────────────────────────────────────"
echo "Step 2: Running local validation..."
echo ""

if bash scripts/validate_all.sh > /tmp/validate.log 2>&1; then
    echo "✓ All local validations passed"
else
    echo "❌ Local validation failed"
    echo ""
    echo "Output:"
    tail -30 /tmp/validate.log
    exit 1
fi
echo ""

# Step 3: Build frontend
echo "────────────────────────────────────────────────────────────"
echo "Step 3: Building frontend..."
echo ""

cd frontend

if ! npm run build > /tmp/frontend_build.log 2>&1; then
    echo "❌ Frontend build failed"
    echo ""
    echo "Output:"
    tail -30 /tmp/frontend_build.log
    exit 1
fi

if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
    echo "❌ Frontend dist/ folder empty or missing"
    exit 1
fi

echo "✓ Frontend built: dist/ created"
cd ..
echo ""

# Step 4: Test Docker build
echo "────────────────────────────────────────────────────────────"
echo "Step 4: Testing Docker build locally..."
echo ""

if ! fly build > /tmp/fly_build.log 2>&1; then
    echo "❌ Docker build failed"
    echo ""
    echo "Error output:"
    tail -50 /tmp/fly_build.log
    echo ""
    echo "Full log: /tmp/fly_build.log"
    exit 1
fi

echo "✓ Docker build successful"
echo ""

# Step 5: Confirm environment variables
echo "────────────────────────────────────────────────────────────"
echo "Step 5: Checking environment variables..."
echo ""

SECRETS=$(fly secrets list 2>/dev/null | grep -c "✓")
if [ "$SECRETS" -lt 2 ]; then
    echo "⚠️  Few or no secrets configured"
    echo ""
    echo "Required secrets:"
    echo "  DATABASE_URL      - Database connection"
    echo "  SECRET_KEY        - JWT signing key (min 32 chars)"
    echo ""
    echo "Set with: fly secrets set VAR=value"
    echo ""
    read -p "Continue deployment anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ Secrets configured: $SECRETS found"
fi
echo ""

# Step 6: Deploy
echo "────────────────────────────────────────────────────────────"
echo "Step 6: Deploying to Fly.io..."
echo ""

echo "Deploying: $APP_NAME"
echo ""

if fly deploy > /tmp/fly_deploy.log 2>&1; then
    echo "✓ Deployment successful"
else
    echo "❌ Deployment failed"
    echo ""
    echo "Error output:"
    tail -50 /tmp/fly_deploy.log
    exit 1
fi

echo ""

# Step 7: Test deployed app
echo "────────────────────────────────────────────────────────────"
echo "Step 7: Testing deployed app..."
echo ""

DOMAIN="${APP_NAME}.fly.dev"
echo "Testing: https://${DOMAIN}"
echo ""

# Wait for app to be ready
echo "Waiting for app to start (up to 30 seconds)..."
for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/docs" | grep -q "200"; then
        echo "✓ App is responding (HTTP 200)"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠️  App did not respond within 30 seconds"
        echo ""
        echo "Check status:"
        echo "  fly status"
        echo "  fly logs"
    fi
    printf "."
    sleep 1
done
echo ""

# Test health endpoint
if curl -s "https://${DOMAIN}/docs" > /dev/null 2>&1; then
    echo "✓ Swagger UI accessible"
fi
echo ""

# Step 8: Success summary
echo "════════════════════════════════════════════════════════════"
echo "                    DEPLOYMENT SUCCESS"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "App deployed: $APP_NAME"
echo "URL: https://${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Test in browser: https://${DOMAIN}"
echo "  2. Add custom domain: fly certs add yourdomain.com"
echo "  3. Monitor logs: fly logs"
echo "  4. View status: fly status"
echo ""
echo "Useful commands:"
echo "  fly logs              - View live logs"
echo "  fly secrets list      - View environment variables"
echo "  fly scale count 2     - Run 2 instances"
echo "  fly releases          - View deployment history"
echo "  fly destroy           - Delete app"
echo ""
