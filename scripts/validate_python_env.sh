#!/bin/bash
# Part A: Python Environment Validation
# Validates Python 3.11.9 installation and core dependencies

set -e

echo "=== Part A: Python Environment Validation ==="
echo ""

# Check Python version
echo "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR_MINOR=$(echo $PYTHON_VERSION | cut -d. -f1-2)
REQUIRED_MAJOR_MINOR="3.11"

if [ "$PYTHON_MAJOR_MINOR" != "$REQUIRED_MAJOR_MINOR" ]; then
    echo "⚠️  Python version mismatch: found $PYTHON_VERSION, expected $REQUIRED_MAJOR_MINOR.x"
    echo "   Install via: pyenv install 3.11.9 && pyenv local 3.11.9"
    exit 1
else
    echo "✓ Python $PYTHON_VERSION detected"
fi

echo ""
echo "Checking core dependencies..."

# Check key imports
python3 << 'EOF'
import sys

dependencies = [
    ('bcrypt', 'bcrypt'),
    ('pydantic', 'pydantic'),
    ('fastapi', 'fastapi'),
    ('sqlalchemy', 'sqlalchemy'),
    ('dotenv', 'python-dotenv'),
    ('jwt', 'pyjwt'),
]

failed = []
for module_name, package_name in dependencies:
    try:
        __import__(module_name)
        print(f"  ✓ {package_name}")
    except ImportError:
        print(f"  ✗ {package_name} NOT FOUND")
        failed.append(package_name)

if failed:
    print(f"\n❌ Missing dependencies: {', '.join(failed)}")
    print("   Fix with: pip install -r requirements.txt")
    sys.exit(1)
else:
    print("\n✓ All core dependencies installed")
EOF

echo ""
echo "✅ Part A: Python environment validation PASSED"
