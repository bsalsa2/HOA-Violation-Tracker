#!/bin/bash
# Fly.io Troubleshooting Helper
# Diagnoses common deployment issues

set +e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        Fly.io Troubleshooting Helper                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Fly CLI
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not installed"
    exit 1
fi

# Get app name
if [ ! -f "fly.toml" ]; then
    echo "❌ fly.toml not found"
    exit 1
fi

APP_NAME=$(grep "^app = " fly.toml | cut -d'"' -f2)
echo "App: $APP_NAME"
echo ""

# Menu
echo "Troubleshooting options:"
echo ""
echo "1. Check deployment status"
echo "2. View recent logs"
echo "3. Check environment variables"
echo "4. Test database connection"
echo "5. SSH into machine"
echo "6. Restart machine"
echo "7. View machine list"
echo "8. Check disk space"
echo "9. Rebuild and redeploy"
echo "0. Exit"
echo ""

read -p "Choose option (0-9): " choice

case $choice in
    1)
        echo ""
        echo "Deployment Status:"
        echo "────────────────────────────────────────────────────────"
        fly status
        ;;

    2)
        echo ""
        echo "Recent Logs:"
        echo "────────────────────────────────────────────────────────"
        echo ""
        read -p "How many lines? (default 50): " lines
        lines=${lines:-50}
        fly logs -n $lines
        ;;

    3)
        echo ""
        echo "Environment Variables (Secrets):"
        echo "────────────────────────────────────────────────────────"
        fly secrets list
        echo ""
        echo "Tip: Set new secret with:"
        echo "  fly secrets set VARIABLE_NAME=value"
        ;;

    4)
        echo ""
        echo "Testing Database Connection:"
        echo "────────────────────────────────────────────────────────"
        echo ""
        echo "Running database test inside container..."
        echo ""

        fly ssh console << 'EOF'
python3 << 'PYEOF'
import os
from sqlalchemy import create_engine, text

db_url = os.getenv('DATABASE_URL', '')
if not db_url:
    print("❌ DATABASE_URL not set")
    exit(1)

print(f"Database URL: {db_url[:50]}...")
print("")

try:
    engine = create_engine(db_url)
    print("Testing connection...")

    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("✓ Connection successful!")
        print("")

        # Try a real query
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        count = result.scalar()
        print(f"✓ Tables accessible")
        print(f"  Users table has {count} rows")

except Exception as e:
    print(f"❌ Connection failed: {e}")
    print("")
    print("Troubleshooting:")
    print("  - Check DATABASE_URL is correct: fly secrets list")
    print("  - Ensure database server is running")
    print("  - Verify firewall allows connection")
    exit(1)
PYEOF
EOF
        ;;

    5)
        echo ""
        echo "SSH into machine:"
        echo "────────────────────────────────────────────────────────"
        echo ""
        echo "Connecting to container..."
        fly ssh console
        ;;

    6)
        echo ""
        echo "Restarting machine..."
        echo ""

        MACHINE_ID=$(fly machine list | grep "app" | awk '{print $1}' | head -1)
        if [ -z "$MACHINE_ID" ]; then
            echo "❌ No machines found"
            exit 1
        fi

        echo "Machine ID: $MACHINE_ID"
        fly machine restart $MACHINE_ID
        echo "✓ Machine restarted"
        ;;

    7)
        echo ""
        echo "Machine List:"
        echo "────────────────────────────────────────────────────────"
        fly machine list
        echo ""
        echo "Expected output: 1 machine in 'started' state"
        ;;

    8)
        echo ""
        echo "Checking disk space:"
        echo "────────────────────────────────────────────────────────"
        echo ""

        fly ssh console << 'EOF'
df -h
echo ""
du -sh /app
EOF
        ;;

    9)
        echo ""
        echo "Rebuilding and redeploying..."
        echo ""

        # Build frontend
        echo "1. Building frontend..."
        cd frontend
        if npm run build > /tmp/build.log 2>&1; then
            echo "   ✓ Frontend built"
        else
            echo "   ❌ Frontend build failed"
            tail -20 /tmp/build.log
            exit 1
        fi
        cd ..

        # Clear Docker cache
        echo "2. Clearing Docker cache..."
        fly build --remote-only

        # Deploy
        echo "3. Deploying..."
        if fly deploy > /tmp/deploy.log 2>&1; then
            echo "   ✓ Deployed"
        else
            echo "   ❌ Deploy failed"
            tail -20 /tmp/deploy.log
            exit 1
        fi

        echo ""
        echo "✓ Rebuild and deployment complete"
        echo ""
        echo "Monitor with: fly logs"
        ;;

    0)
        echo "Exiting..."
        ;;

    *)
        echo "Invalid option"
        exit 1
        ;;
esac

echo ""
