# Vibeful Setup — self-contained Windows PowerShell setup script.
#
# Detects prerequisites, installs missing ones, and starts Vibeful.
# Works on Windows 10/11 with PowerShell 5.1+.
#
# Usage:
#   .\scripts\setup.ps1
#
# Or after cloning:
#   git clone https://github.com/SimonJamesOdell/vibeful.git
#   cd vibeful; .\scripts\setup.ps1

param()

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Vibeful Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check prerequisites ─────────────────────────────────────

Write-Host "Checking prerequisites..." -ForegroundColor White
Write-Host ""

$NEEDS_INSTALL = $false

# Python
try {
    $py = python --version 2>&1
    Write-Host "  ✓ Python found ($py)" -ForegroundColor Green
} catch {
    try {
        $py = python3 --version 2>&1
        Write-Host "  ✓ Python found ($py)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Python not found" -ForegroundColor Yellow
        Write-Host "    Install from: https://www.python.org/downloads/" -ForegroundColor Gray
        Write-Host "    (Check 'Add Python to PATH' during install)" -ForegroundColor Gray
        $NEEDS_INSTALL = $true
    }
}

# Node.js
try {
    $node = node --version 2>&1
    Write-Host "  ✓ Node.js found ($node)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found" -ForegroundColor Yellow
    Write-Host "    Install from: https://nodejs.org/ (LTS version)" -ForegroundColor Gray
    $NEEDS_INSTALL = $true
}

# Docker (optional)
try {
    docker info 2>&1 | Out-Null
    Write-Host "  ✓ Docker found (production mode available)" -ForegroundColor Green
} catch {
    Write-Host "  ○ Docker not found (local mode only — fine for dev)" -ForegroundColor Yellow
}

Write-Host ""

if ($NEEDS_INSTALL) {
    Write-Host "Some packages are missing. Please install them and re-run this script." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── 2. Install pnpm if needed ──────────────────────────────────

try {
    pnpm --version 2>&1 | Out-Null
} catch {
    Write-Host "Installing pnpm..." -ForegroundColor White
    npm install -g pnpm 2>&1 | Out-Null
    Write-Host "  ✓ pnpm installed" -ForegroundColor Green
    Write-Host ""
}

# ── 3. Install Vibeful dependencies ────────────────────────────

Write-Host "Installing Vibeful dependencies..." -ForegroundColor White
Write-Host ""

Write-Host "  → Python packages..."
Push-Location "$ROOT\packages\agent-engine"
$alreadyInstalled = Test-Path "src\vibeful_agent_engine.egg-info\PKG-INFO"
if ($alreadyInstalled) {
    Write-Host "  ✓ Python packages already installed (skipping pip install)" -ForegroundColor Green
} else {
    Write-Host "    (first run — installing, this may take a moment...)"
    try {
        pip install -e ".[dev]" --quiet 2>&1 | Out-Null
        Write-Host "  ✓ Python dependencies installed" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ Python install had warnings (non-fatal)" -ForegroundColor Yellow
    }
}
Pop-Location

Write-Host "  → Node.js packages..."
Push-Location "$ROOT\packages\management-console"
try {
    $env:COREPACK_ENABLE_STRICT = "0"
    pnpm install --silent 2>&1 | Out-Null
    Write-Host "  ✓ Node.js dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ pnpm install had warnings (non-fatal)" -ForegroundColor Yellow
}
Pop-Location

Write-Host ""

# ── 4. Check API key ───────────────────────────────────────────

Write-Host "Checking LLM configuration..." -ForegroundColor White
Write-Host ""

$API_KEY = $env:DEEPSEEK_API_KEY ?? ""

if ($API_KEY -and $API_KEY.Length -gt 20 -and $API_KEY -notmatch "your-deepseek") {
    Write-Host "  ✓ DEEPSEEK_API_KEY found in environment" -ForegroundColor Green
} elseif (Test-Path "$ROOT\.env") {
    $envContent = Get-Content "$ROOT\.env" -Raw
    if ($envContent -match "DEEPSEEK_API_KEY\s*=\s*(\S+)") {
        $API_KEY = $Matches[1].Trim('"', "'")
        if ($API_KEY.Length -gt 20 -and $API_KEY -notmatch "your-deepseek") {
            Write-Host "  ✓ DEEPSEEK_API_KEY found in .env" -ForegroundColor Green
        }
    }
}

if (-not $API_KEY -or $API_KEY.Length -le 20) {
    Write-Host "  ○ No API key found. You'll need one for AI agents." -ForegroundColor Yellow
    Write-Host "    Get a free key: https://platform.deepseek.com/api_keys" -ForegroundColor Gray
    Write-Host "    Paste it in the console when prompted (no file editing needed)." -ForegroundColor Gray
    Write-Host ""
}

# ── 5. Start Vibeful ───────────────────────────────────────────

Write-Host "Starting Vibeful..." -ForegroundColor White
Write-Host ""

# Kill previous instances
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "vite" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

# Start agent engine
Write-Host "  → Starting agent engine (port 50052)..."
$agentJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\packages\agent-engine"
    $env:VIBEFUL_STORAGE = "sqlite"
    python -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052 --log-level warning
} -ArgumentList $ROOT

# Wait for it
Write-Host "  → Waiting for agent engine..."
for ($i = 1; $i -le 30; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:50052/health" -TimeoutSec 2
        if ($health.status -eq "ok") {
            Write-Host "  ✓ Agent engine ready" -ForegroundColor Green
            break
        }
    } catch { }
    Start-Sleep 1
}

# Start management console
Write-Host "  → Starting management console (port 5174)..."
$consoleJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location "$root\packages\management-console"
    $env:COREPACK_ENABLE_STRICT = "0"
    pnpm dev --host 0.0.0.0 --port 5174
} -ArgumentList $ROOT

Start-Sleep 3

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Vibeful is Ready" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Management Console:  http://localhost:5174"
Write-Host "  Agent Engine API:    http://localhost:50052"
Write-Host ""
Write-Host "  The Vibeful Guide will greet you when you open the console."
Write-Host ""
Write-Host "  To stop: close this window or run:"
Write-Host "    Get-Job | Stop-Job"
Write-Host ""
Write-Host "Press Ctrl+C to stop both services." -ForegroundColor Gray

try {
    while ($true) { Start-Sleep 1 }
} finally {
    Get-Job | Stop-Job
    Get-Job | Remove-Job
}
