# =============================================================================
# VENPOD WebGPU - Complete Setup & Build Script (Windows PowerShell)
# Downloads Emscripten, sets up environment, and builds the WASM module
# =============================================================================

param(
    [switch]$SkipEmscripten,
    [switch]$CleanBuild
)

$ProgressPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EmsdkDir = Join-Path $ScriptDir "emsdk"
$BuildDir = Join-Path $ScriptDir "build"
$OutputDir = Join-Path $ScriptDir "..\frontend\venpod"
$ToolsDir = Join-Path $ScriptDir "tools"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Status {
    param([string]$Message, [string]$Color = "Green")
    Write-Host "[*] $Message" -ForegroundColor $Color
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Set-EmsdkEnvironment {
    param([string]$EmsdkPath)

    $envBat = Join-Path $EmsdkPath "emsdk_env.bat"
    if (-not (Test-Path $envBat)) {
        return $false
    }

    # Create a temp batch file that runs emsdk_env and outputs environment
    $tempBat = Join-Path $env:TEMP "emsdk_env_capture.bat"
    $tempOut = Join-Path $env:TEMP "emsdk_env_output.txt"

    $batContent = "@echo off`r`ncall `"$envBat`" >nul 2>nul`r`nset > `"$tempOut`""
    [System.IO.File]::WriteAllText($tempBat, $batContent)

    cmd /c $tempBat 2>$null

    if (Test-Path $tempOut) {
        Get-Content $tempOut | ForEach-Object {
            if ($_ -match '^(.+?)=(.*)$') {
                $name = $matches[1]
                $value = $matches[2]
                [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
        Remove-Item $tempOut -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $tempBat -Force -ErrorAction SilentlyContinue

    return $true
}

function Install-Ninja {
    $ninjaDir = Join-Path $ToolsDir "ninja"
    $ninjaExe = Join-Path $ninjaDir "ninja.exe"

    if (Test-Path $ninjaExe) {
        Write-Status "Ninja already installed"
        return $ninjaDir
    }

    Write-Status "Downloading Ninja build system..."

    if (-not (Test-Path $ToolsDir)) {
        New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
    }
    if (-not (Test-Path $ninjaDir)) {
        New-Item -ItemType Directory -Force -Path $ninjaDir | Out-Null
    }

    $ninjaUrl = "https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip"
    $ninjaZip = Join-Path $ToolsDir "ninja.zip"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $ninjaUrl -OutFile $ninjaZip -UseBasicParsing

        # Extract using .NET
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ninjaZip, $ninjaDir)

        Remove-Item $ninjaZip -Force -ErrorAction SilentlyContinue
        Write-Status "Ninja installed successfully"
    } catch {
        Write-ErrorMsg "Failed to download Ninja: $_"
        return $null
    }

    return $ninjaDir
}

# Banner
Write-Host ""
Write-Host "  VENPOD WebGPU Setup & Build Script" -ForegroundColor Magenta
Write-Host "  3D Voxel Physics Engine for the Web" -ForegroundColor Magenta
Write-Host ""

# Check for Git
Write-Step "Checking Prerequisites"
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-ErrorMsg "Git is not installed. Please install Git first."
    Write-Host "Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}
Write-Status "Git found: $($git.Source)"

# Check for Python (required by Emscripten)
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $python) {
    Write-ErrorMsg "Python is not installed. Please install Python 3.x first."
    Write-Host "Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}
Write-Status "Python found: $($python.Source)"

# Check/Install Ninja
$ninja = Get-Command ninja -ErrorAction SilentlyContinue
if (-not $ninja) {
    Write-Step "Installing Ninja Build System"
    $ninjaDir = Install-Ninja
    if ($ninjaDir) {
        $env:PATH = "$ninjaDir;$env:PATH"
    }
}
$ninja = Get-Command ninja -ErrorAction SilentlyContinue
if ($ninja) {
    Write-Status "Ninja found: $($ninja.Source)"
} else {
    Write-ErrorMsg "Ninja installation failed"
    exit 1
}

# Step 1: Install/Update Emscripten SDK
if (-not $SkipEmscripten) {
    Write-Step "Setting up Emscripten SDK"

    if (Test-Path $EmsdkDir) {
        Write-Status "Emscripten SDK directory exists, updating..."
        Set-Location $EmsdkDir
        git pull 2>$null
    } else {
        Write-Status "Cloning Emscripten SDK (this may take a few minutes)..."
        git clone https://github.com/emscripten-core/emsdk.git $EmsdkDir
        Set-Location $EmsdkDir
    }

    Write-Status "Installing latest Emscripten (this may take 5-10 minutes)..."
    cmd /c ".\emsdk.bat install latest"

    Write-Status "Activating Emscripten..."
    cmd /c ".\emsdk.bat activate latest"

    # Source the environment
    Write-Status "Loading Emscripten environment..."
    Set-EmsdkEnvironment -EmsdkPath $EmsdkDir | Out-Null
} else {
    Write-Status "Skipping Emscripten setup (using existing installation)" "Yellow"

    # Try to source existing emsdk if it exists
    if (Test-Path $EmsdkDir) {
        Set-Location $EmsdkDir
        Set-EmsdkEnvironment -EmsdkPath $EmsdkDir | Out-Null
    }
}

# Verify emcc is available
$emcc = Get-Command emcc -ErrorAction SilentlyContinue
if (-not $emcc) {
    # Try to find it in emsdk
    $emccPath = Join-Path $EmsdkDir "upstream\emscripten"
    if (Test-Path $emccPath) {
        $env:PATH = "$emccPath;$env:PATH"
        $emcc = Get-Command emcc -ErrorAction SilentlyContinue
    }
}

if (-not $emcc) {
    Write-ErrorMsg "emcc not found in PATH. Emscripten may not be properly installed."
    Write-Host "Try running: .\emsdk_env.bat" -ForegroundColor Yellow
    exit 1
}
Write-Status "Emscripten compiler ready: emcc"

# Step 2: Clean build if requested
if ($CleanBuild -and (Test-Path $BuildDir)) {
    Write-Step "Cleaning Build Directory"
    Remove-Item -Recurse -Force $BuildDir
    Write-Status "Build directory cleaned"
}

# Step 3: Create build directory and run CMake
Write-Step "Configuring Build with CMake"
Set-Location $ScriptDir

if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
}
Set-Location $BuildDir

Write-Status "Running emcmake cmake with Ninja..."

# Use emcmake via cmd to avoid PowerShell issues
$emcmakePath = Join-Path $EmsdkDir "upstream\emscripten\emcmake.bat"
if (Test-Path $emcmakePath) {
    cmd /c "`"$emcmakePath`" cmake .. -DCMAKE_BUILD_TYPE=Release -G Ninja"
} else {
    cmd /c "emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -G Ninja"
}

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "CMake configuration failed"
    exit 1
}

# Step 4: Build the project
Write-Step "Building VENPOD WebAssembly Module"

$emmakePath = Join-Path $EmsdkDir "upstream\emscripten\emmake.bat"

Write-Status "Building with Ninja..."
if (Test-Path $emmakePath) {
    cmd /c "`"$emmakePath`" ninja"
} else {
    cmd /c "emmake ninja"
}

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Build failed"
    exit 1
}

# Step 5: Copy output files to frontend
Write-Step "Deploying to Frontend"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$filesToCopy = @("venpod.js", "venpod.wasm", "venpod.html")
$copiedCount = 0

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $BuildDir $file
    if (Test-Path $sourcePath) {
        Copy-Item -Force $sourcePath $OutputDir
        $copiedCount++
        Write-Status "Copied: $file"
    }
}

if ($copiedCount -eq 0) {
    Write-ErrorMsg "No output files found to copy!"
    Write-Host "Build directory contents:" -ForegroundColor Yellow
    Get-ChildItem $BuildDir | Format-Table Name, Length
    exit 1
}

# Step 6: Verify deployment
Write-Step "Verifying Deployment"

$jsFile = Join-Path $OutputDir "venpod.js"
$wasmFile = Join-Path $OutputDir "venpod.wasm"

if ((Test-Path $jsFile) -and (Test-Path $wasmFile)) {
    $jsSize = [math]::Round((Get-Item $jsFile).Length / 1KB, 2)
    $wasmSize = [math]::Round((Get-Item $wasmFile).Length / 1KB, 2)

    Write-Status "venpod.js: $jsSize KB"
    Write-Status "venpod.wasm: $wasmSize KB"
} else {
    Write-ErrorMsg "Output files missing!"
    exit 1
}

# Done!
Write-Host ""
Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host ""
Write-Host "  Output files deployed to:" -ForegroundColor White
Write-Host "    $OutputDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "  VENPOD is now available at:" -ForegroundColor White
Write-Host "    http://localhost:5000/venpod.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    - Restart your Flask server if running" -ForegroundColor Gray
Write-Host "    - Navigate to /venpod.html in Chrome 113+" -ForegroundColor Gray
Write-Host ""

# Return to original directory
Set-Location $ScriptDir
