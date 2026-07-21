#!/bin/bash
# Part C Enhanced: Frontend Build with Exact Package Versions
# Tests Node version, npm modules, React/Vite build

set +e

echo "=== Part C: Frontend Build (Enhanced) ==="
echo ""

cd frontend

# Step 1: Check Node and npm versions
echo "Step 1: Verifying Node.js and npm versions..."

if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js not found"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "  ✓ Node.js $NODE_VERSION"

if ! command -v npm &> /dev/null; then
    echo "  ✗ npm not found"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "  ✓ npm $NPM_VERSION"
echo ""

# Step 2: Install exact versions from package-lock.json
echo "Step 2: Installing exact package versions (npm ci)..."
npm ci -q 2>&1
if [ $? -ne 0 ]; then
    echo "  ✗ npm ci failed"
    exit 1
fi
echo "  ✓ Dependencies installed from package-lock.json"
echo ""

# Step 3: Verify key packages
echo "Step 3: Verifying key packages..."
required_packages=("react" "react-dom" "react-router-dom" "vite" "tailwindcss")
all_found=true

for pkg in "${required_packages[@]}"; do
    if [ -d "node_modules/$pkg" ]; then
        VERSION=$(cat node_modules/$pkg/package.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\).*/\1/')
        echo "  ✓ $pkg ($VERSION)"
    else
        echo "  ✗ $pkg NOT FOUND"
        all_found=false
    fi
done

if [ "$all_found" = false ]; then
    echo ""
    echo "  Missing packages. Running npm install..."
    npm install
fi
echo ""

# Step 4: Run build
echo "Step 4: Building frontend..."
npm run build 2>&1 > /tmp/npm_build.log
BUILD_RESULT=$?

if [ $BUILD_RESULT -eq 0 ]; then
    echo "  ✓ Build completed successfully"
else
    echo "  ✗ Build failed. Output:"
    tail -20 /tmp/npm_build.log
    exit 1
fi

# Step 5: Verify dist folder
echo ""
echo "Step 5: Verifying build output..."

if [ ! -d "dist" ]; then
    echo "  ✗ dist/ folder not created"
    exit 1
fi

# Check key files
required_files=("index.html")
for file in "${required_files[@]}"; do
    if [ -f "dist/$file" ]; then
        SIZE=$(wc -c < "dist/$file")
        echo "  ✓ dist/$file ($SIZE bytes)"
    else
        echo "  ✗ dist/$file NOT FOUND"
        exit 1
    fi
done

# Check for JS/CSS assets
JS_COUNT=$(ls -1 dist/assets/*.js 2>/dev/null | wc -l)
CSS_COUNT=$(ls -1 dist/assets/*.css 2>/dev/null | wc -l)

if [ $JS_COUNT -gt 0 ] && [ $CSS_COUNT -gt 0 ]; then
    echo "  ✓ Assets generated: $JS_COUNT JS files, $CSS_COUNT CSS files"
else
    echo "  ✗ Assets not generated properly"
    exit 1
fi

echo ""
echo "✅ Part C (Enhanced): Frontend build PASSED"

cd ..
