# =============================================================================
# VENPOD WebGPU - Build Script (Windows PowerShell)
# Compiles the C++ source to WebAssembly using Emscripten
# =============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = Join-Path $ScriptDir "build"
$OutputDir = Join-Path $ScriptDir "..\frontend\venpod"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  VENPOD WebGPU Build" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check for Emscripten
$emcc = Get-Command emcc -ErrorAction SilentlyContinue
if (-not $emcc) {
    Write-Host "ERROR: Emscripten not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Emscripten SDK:" -ForegroundColor Yellow
    Write-Host "  git clone https://github.com/emscripten-core/emsdk.git"
    Write-Host "  cd emsdk"
    Write-Host "  .\emsdk install latest"
    Write-Host "  .\emsdk activate latest"
    Write-Host "  .\emsdk_env.bat"
    exit 1
}

# Create build directory
Write-Host "[1/4] Creating build directory..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
Set-Location $BuildDir

# Run CMake with Emscripten
Write-Host "[2/4] Running CMake with Emscripten..." -ForegroundColor Green
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0) { throw "CMake failed" }

# Build
Write-Host "[3/4] Building WASM module..." -ForegroundColor Green
emmake make -j4
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# Copy output to frontend
Write-Host "[4/4] Copying output to frontend..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item -Force "venpod.js" $OutputDir -ErrorAction SilentlyContinue
Copy-Item -Force "venpod.wasm" $OutputDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output files:" -ForegroundColor Green
Write-Host "  $OutputDir\venpod.js"
Write-Host "  $OutputDir\venpod.wasm"
Write-Host ""
Write-Host "The VENPOD demo is now available at /venpod.html" -ForegroundColor Yellow
