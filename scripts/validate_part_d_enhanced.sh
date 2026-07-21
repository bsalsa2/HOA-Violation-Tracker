#!/bin/bash
# Part D Enhanced: Full Integration Test
# Requires backend and frontend already running or starts them for testing

set +e

echo "=== Part D: Full Integration Test (Enhanced) ==="
echo ""

# Check if we should start servers or use existing ones
BACKEND_RUNNING=false
FRONTEND_RUNNING=false

# Test if backend is already running
if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    BACKEND_RUNNING=true
    echo "✓ Backend already running on http://127.0.0.1:8000"
else
    echo "ⓘ Backend not running"
fi

# Test if frontend is already running
if curl -s http://127.0.0.1:5173 > /dev/null 2>&1; then
    FRONTEND_RUNNING=true
    echo "✓ Frontend already running on http://127.0.0.1:5173"
else
    echo "ⓘ Frontend not running"
fi

echo ""

# If backend not running, inform user
if [ "$BACKEND_RUNNING" = false ]; then
    echo "⚠️  Backend not running. Please start it in Terminal 1:"
    echo ""
    echo "  Terminal 1:"
    echo "  $ source venv/bin/activate"
    echo "  $ uvicorn main:app --reload"
    echo ""
    echo "  Wait for: 'Uvicorn running on http://127.0.0.1:8000'"
    echo ""
fi

# If frontend not running, inform user
if [ "$FRONTEND_RUNNING" = false ]; then
    echo "⚠️  Frontend not running. Please start it in Terminal 2:"
    echo ""
    echo "  Terminal 2:"
    echo "  $ cd frontend"
    echo "  $ npm run dev"
    echo ""
    echo "  Wait for: 'Local: http://localhost:5173'"
    echo ""
fi

# If neither running, can't run full integration test
if [ "$BACKEND_RUNNING" = false ] || [ "$FRONTEND_RUNNING" = false ]; then
    echo "Once both servers are running, run:"
    echo "  bash scripts/validate_part_d_enhanced.sh"
    echo ""
    exit 1
fi

echo "Step 1: Running pytest integration tests..."
echo ""

python3 -m pytest tests/test_api.py -v --tb=short 2>&1

PYTEST_RESULT=$?

echo ""
if [ $PYTEST_RESULT -eq 0 ]; then
    echo "✅ Part D (Enhanced): All tests PASSED"
    exit 0
else
    echo "❌ Part D (Enhanced): Some tests FAILED"
    exit 1
fi
