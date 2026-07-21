#!/bin/bash
# Part C: Frontend Build Check
# Validates npm dependencies and build compilation

set -e

echo "=== Part C: Frontend Build Validation ==="
echo ""

cd frontend

# Check Node.js
echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "  ✓ Node.js $NODE_VERSION detected"

# Check npm
echo ""
echo "Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "✗ npm not found"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "  ✓ npm $NPM_VERSION detected"

# Check dependencies
echo ""
echo "Checking npm dependencies..."
if [ ! -d "node_modules" ]; then
    echo "  ⚠️  node_modules not found, running npm install..."
    npm install
else
    echo "  ✓ node_modules directory exists"
fi

# Validate key packages
echo ""
echo "Verifying key packages..."

required_packages=(
    "react"
    "react-dom"
    "react-router-dom"
    "tailwindcss"
    "vite"
)

all_present=true
for package in "${required_packages[@]}"; do
    if [ -d "node_modules/$package" ]; then
        echo "  ✓ $package"
    else
        echo "  ✗ $package NOT FOUND"
        all_present=false
    fi
done

if [ "$all_present" = false ]; then
    echo ""
    echo "Missing packages detected. Running npm install..."
    npm install
fi

# Test build
echo ""
echo "Testing frontend build..."
npm run build 2>&1 | tail -5

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo ""
    echo "✓ Frontend build successful"
else
    echo ""
    echo "✗ Frontend build failed"
    exit 1
fi

cd ..

echo ""
echo "✅ Part C: Frontend build validation PASSED"
