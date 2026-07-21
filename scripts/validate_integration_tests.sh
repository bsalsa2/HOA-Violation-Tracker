#!/bin/bash
# Part D: Integration Tests
# Runs pytest test suite to validate application logic

set -e

echo "=== Part D: Integration Tests ==="
echo ""

# Check pytest is installed
echo "Checking pytest installation..."
if ! python3 -m pytest --version &> /dev/null; then
    echo "✗ pytest not found"
    echo "  Install with: pip install pytest"
    exit 1
fi

PYTEST_VERSION=$(python3 -m pytest --version 2>&1 | awk '{print $2}')
echo "  ✓ pytest $PYTEST_VERSION detected"

echo ""
echo "Running test suite..."
echo ""

# Run tests with verbose output
if python3 -m pytest tests/ -v --tb=short; then
    echo ""
    echo "✅ Part D: All integration tests PASSED"
else
    echo ""
    echo "❌ Part D: Some tests FAILED"
    exit 1
fi
