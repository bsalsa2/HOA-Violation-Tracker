#!/bin/bash
# Complete Local Environment Validation
# Runs all 5-part validation framework

set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   HOA Violation Tracker - Local Environment Validation     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Track overall success
PARTS_PASSED=0
PARTS_FAILED=0

# Part A: Python Environment
echo ""
echo "────────────────────────────────────────────────────────────"
if bash scripts/validate_python_env.sh; then
    ((PARTS_PASSED++))
else
    ((PARTS_FAILED++))
    echo ""
    echo "⚠️  Fix Python environment and try again"
fi

# Part B: Database Schema
echo ""
echo "────────────────────────────────────────────────────────────"
if python3 scripts/validate_database_schema.py; then
    ((PARTS_PASSED++))
else
    ((PARTS_FAILED++))
    echo ""
    echo "⚠️  Initialize database: python3 -c 'from database import init_db; init_db()'"
fi

# Part C: Frontend Build
echo ""
echo "────────────────────────────────────────────────────────────"
if bash scripts/validate_frontend_build.sh; then
    ((PARTS_PASSED++))
else
    ((PARTS_FAILED++))
    echo ""
    echo "⚠️  Fix frontend build issues above"
fi

# Part D: Integration Tests
echo ""
echo "────────────────────────────────────────────────────────────"
if bash scripts/validate_integration_tests.sh; then
    ((PARTS_PASSED++))
else
    ((PARTS_FAILED++))
    echo ""
    echo "⚠️  Review test failures above"
fi

# Part E: Environment Configuration
echo ""
echo "────────────────────────────────────────────────────────────"
if python3 scripts/validate_env_config.py; then
    ((PARTS_PASSED++))
else
    ((PARTS_FAILED++))
fi

# Final Summary
echo ""
echo "════════════════════════════════════════════════════════════"
echo "                    VALIDATION SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Parts Passed: $PARTS_PASSED / 5"
echo "  Parts Failed: $PARTS_FAILED / 5"
echo ""

if [ $PARTS_FAILED -eq 0 ]; then
    echo "✅ All validations passed! Local environment is ready."
    echo ""
    echo "Next steps:"
    echo "  • Start backend: python3 main.py"
    echo "  • Start frontend: cd frontend && npm run dev"
    echo "  • Open http://localhost:5173"
    echo ""
    exit 0
else
    echo "❌ Some validations failed. Review errors above."
    echo ""
    exit 1
fi
