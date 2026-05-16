#!/bin/bash
# =============================================================================
# VENPOD WebGPU - Build Script
# Compiles the C++ source to WebAssembly using Emscripten
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/../frontend/venpod"

echo "=========================================="
echo "  VENPOD WebGPU Build"
echo "=========================================="

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "ERROR: Emscripten not found!"
    echo ""
    echo "Please install Emscripten SDK:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Create build directory
echo "[1/4] Creating build directory..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Run CMake with Emscripten
echo "[2/4] Running CMake with Emscripten..."
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
echo "[3/4] Building WASM module..."
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Copy output to frontend
echo "[4/4] Copying output to frontend..."
mkdir -p "$OUTPUT_DIR"
cp -f venpod.html "$OUTPUT_DIR/" 2>/dev/null || true
cp -f venpod.js "$OUTPUT_DIR/"
cp -f venpod.wasm "$OUTPUT_DIR/"

echo ""
echo "=========================================="
echo "  Build Complete!"
echo "=========================================="
echo ""
echo "Output files:"
echo "  $OUTPUT_DIR/venpod.js"
echo "  $OUTPUT_DIR/venpod.wasm"
echo ""
echo "The VENPOD demo is now available at /venpod.html"
