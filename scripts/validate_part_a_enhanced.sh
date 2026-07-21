#!/bin/bash
# Part A Enhanced: Python Environment with Server Startup
# Tests Python 3.11 compatibility, C extensions, and server health

set +e

echo "=== Part A: Python Environment (Enhanced) ==="
echo ""

# Step 1: Fresh virtual environment
echo "Step 1: Setting up fresh virtual environment..."
if [ ! -d "venv" ]; then
    echo "  Creating venv..."
    python3.11 -m venv venv 2>/dev/null || python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "  ✗ Failed to create venv"
        exit 1
    fi
else
    echo "  ✓ venv already exists"
fi

# Activate venv
echo "  Activating venv..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "  ✗ Failed to activate venv"
    exit 1
fi
echo "  ✓ venv activated"
echo ""

# Step 2: Install dependencies
echo "Step 2: Installing dependencies from requirements.txt..."
pip install -q -r requirements.txt 2>&1
if [ $? -ne 0 ]; then
    echo "  ✗ pip install failed"
    deactivate
    exit 1
fi
echo "  ✓ Dependencies installed"
echo ""

# Step 3: Verify core imports
echo "Step 3: Verifying core imports..."
python << 'EOF'
import sys
try:
    import bcrypt
    import pydantic_core
    import sqlalchemy
    import jwt
    import fastapi
    from dotenv import load_dotenv
    print("  ✓ Core dependencies verified")
except ImportError as e:
    print(f"  ✗ Import failed: {e}")
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    deactivate
    exit 1
fi
echo ""

# Step 4: Start server in background and test health
echo "Step 4: Starting server and testing health endpoint..."
timeout 30 uvicorn main:app --reload --host 127.0.0.1 --port 8000 > /tmp/uvicorn.log 2>&1 &
SERVER_PID=$!

echo "  Waiting for server startup..."
sleep 3

# Check if process is still running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "  ✗ Server failed to start. Log:"
    cat /tmp/uvicorn.log | head -20
    exit 1
fi

# Test health endpoint
echo "  Testing health endpoint..."
RESPONSE=$(curl -s -w "%{http_code}" http://127.0.0.1:8000/docs -o /dev/null 2>/dev/null)

if [ "$RESPONSE" = "200" ]; then
    echo "  ✓ Server running and responding (HTTP 200)"
else
    echo "  ✗ Server health check failed (HTTP $RESPONSE)"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "  ✓ Swagger UI available at http://127.0.0.1:8000/docs"
echo ""

# Step 5: Clean shutdown
echo "Step 5: Testing clean shutdown..."
kill $SERVER_PID 2>/dev/null
sleep 1

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "  ✓ Server shutdown gracefully"
else
    kill -9 $SERVER_PID 2>/dev/null
    echo "  ⚠️  Server required force kill (may indicate cleanup issue)"
fi

echo ""
echo "✅ Part A (Enhanced): Python environment and server PASSED"
echo ""
deactivate
