# CodeSniff Setup and Run Script
# This script ensures correct dependencies and runs frontend + backend in separate terminals

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  CodeSniff Setup & Run Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND_DIR = Join-Path $SCRIPT_DIR "backend"
$FRONTEND_DIR = Join-Path $SCRIPT_DIR "frontend"

# Step 1: Check and install Backend Dependencies
Write-Host "[1/3] Checking backend dependencies..." -ForegroundColor Yellow
Push-Location $BACKEND_DIR
try {
    # Check and fix tree-sitter version
    Write-Host "  Checking tree-sitter version..." -ForegroundColor Gray
    $tsVersion = python -c "try:`n    import tree_sitter; print(tree_sitter.__version__)`nexcept: print('not installed')" 2>&1

    if ($tsVersion -ne "0.21.3") {
        Write-Host "  Installing tree-sitter 0.21.3 and tree-sitter-python 0.21.0..." -ForegroundColor Gray
        pip install --no-deps tree-sitter==0.21.3 tree-sitter-python==0.21.0 --quiet

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  X Failed to install tree-sitter packages" -ForegroundColor Red
            Write-Host ""
            Write-Host "This usually happens when Python packages are in use." -ForegroundColor Yellow
            Write-Host "Please close any running Python processes and try again." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Or manually run:" -ForegroundColor Cyan
            Write-Host "  cd backend" -ForegroundColor Gray
            Write-Host "  pip install --no-deps tree-sitter==0.21.3 tree-sitter-python==0.21.0" -ForegroundColor Gray
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "  OK Tree-sitter updated to 0.21.3" -ForegroundColor Green
    } else {
        Write-Host "  OK Tree-sitter 0.21.3 already installed" -ForegroundColor Green
    }

    # Check and fix NumPy version
    Write-Host "  Checking NumPy version..." -ForegroundColor Gray
    $npVersion = python -c "try:`n    import numpy; print(numpy.__version__)`nexcept: print('missing')" 2>&1

    if ($npVersion -ne "1.26.4") {
        Write-Host "  Installing NumPy 1.26.4..." -ForegroundColor Gray
        pip install --user numpy==1.26.4 --quiet 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Trying without --user flag..." -ForegroundColor Gray
            pip install numpy==1.26.4 --quiet 2>&1 | Out-Null

            if ($LASTEXITCODE -ne 0) {
                Write-Host "  X Failed to install NumPy" -ForegroundColor Red
                Write-Host ""
                Write-Host "Please manually run:" -ForegroundColor Cyan
                Write-Host "  pip install --user numpy==1.26.4" -ForegroundColor Gray
                Pop-Location
                Read-Host "Press Enter to exit"
                exit 1
            }
        }
        Write-Host "  OK NumPy updated to 1.26.4" -ForegroundColor Green
    } else {
        Write-Host "  OK NumPy 1.26.4 already installed" -ForegroundColor Green
    }

    # Check and fix FAISS installation
    Write-Host "  Checking FAISS installation..." -ForegroundColor Gray
    $faissCheck = python -c "try:`n    import faiss; print('ok')`nexcept Exception as e: print('missing')" 2>&1

    if ($faissCheck -ne "ok") {
        Write-Host "  Installing FAISS 1.7.4 (this may take a moment)..." -ForegroundColor Gray
        pip install faiss-cpu==1.7.4 --quiet 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  X Failed to install FAISS" -ForegroundColor Red
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "  OK FAISS 1.7.4 installed" -ForegroundColor Green
    } else {
        Write-Host "  OK FAISS working correctly" -ForegroundColor Green
    }

    # Install all other dependencies
    Write-Host "  Checking all other dependencies..." -ForegroundColor Gray
    pip install -r requirements.txt --quiet 2>&1 | Out-Null

    Write-Host ""
    Write-Host "  =====================================" -ForegroundColor Green
    Write-Host "  Backend dependencies ready!" -ForegroundColor Green
    Write-Host "  =====================================" -ForegroundColor Green
} catch {
    Write-Host "  X Error checking backend dependencies: $_" -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
Pop-Location

# Step 2: Check Frontend Dependencies
Write-Host ""
Write-Host "[2/3] Checking frontend dependencies..." -ForegroundColor Yellow
Push-Location $FRONTEND_DIR
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing npm packages (this may take a moment)..." -ForegroundColor Gray
        npm install --silent 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  OK Frontend dependencies installed" -ForegroundColor Green
        } else {
            Write-Host "  X Failed to install frontend dependencies" -ForegroundColor Red
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    } else {
        Write-Host "  OK Frontend dependencies already installed" -ForegroundColor Green
    }
} catch {
    Write-Host "  X Error checking frontend dependencies: $_" -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Starting CodeSniff Services" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Step 3: Start Backend in new terminal
Write-Host "[3/3] Starting servers..." -ForegroundColor Yellow
$backendScript = @"
Write-Host '=====================================' -ForegroundColor Cyan
Write-Host '  CodeSniff Backend Server' -ForegroundColor Cyan
Write-Host '=====================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Server URL: http://localhost:8000' -ForegroundColor Green
Write-Host 'API Docs:   http://localhost:8000/docs' -ForegroundColor Green
Write-Host ''
Write-Host 'Dependencies:' -ForegroundColor Gray
Write-Host '  - tree-sitter: 0.21.3' -ForegroundColor Gray
Write-Host '  - tree-sitter-python: 0.21.0' -ForegroundColor Gray
Write-Host '  - NumPy: 1.26.4' -ForegroundColor Gray
Write-Host '  - FAISS: 1.7.4' -ForegroundColor Gray
Write-Host ''
Write-Host 'Press Ctrl+C to stop the server' -ForegroundColor Yellow
Write-Host ''
Set-Location '$BACKEND_DIR'
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

$backendScriptPath = Join-Path $env:TEMP "codesniff_backend.ps1"
$backendScript | Out-File -FilePath $backendScriptPath -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $backendScriptPath
Write-Host "  OK Backend terminal opened" -ForegroundColor Green

Start-Sleep -Seconds 2

# Start Frontend in new terminal
$frontendScript = @"
Write-Host '=====================================' -ForegroundColor Cyan
Write-Host '  CodeSniff Frontend Server' -ForegroundColor Cyan
Write-Host '=====================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Server URL: http://localhost:5173' -ForegroundColor Green
Write-Host ''
Write-Host 'Press Ctrl+C to stop the server' -ForegroundColor Yellow
Write-Host ''
Set-Location '$FRONTEND_DIR'
npm run dev
"@

$frontendScriptPath = Join-Path $env:TEMP "codesniff_frontend.ps1"
$frontendScript | Out-File -FilePath $frontendScriptPath -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $frontendScriptPath
Write-Host "  OK Frontend terminal opened" -ForegroundColor Green

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  CodeSniff is Starting!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "-> Frontend: " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host "-> Backend:  " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:8000" -ForegroundColor Cyan
Write-Host "-> API Docs: " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Both servers are running in separate terminal windows." -ForegroundColor Yellow
Write-Host "Close those windows or press Ctrl+C in them to stop the servers." -ForegroundColor Yellow
Write-Host ""
Write-Host "Opening browser in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Open browser
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "OK Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
