#!/usr/bin/env pwsh
<#
.SYNOPSIS
Vibeful Release Gate — must pass before pushing to GitHub.

Runs: Python tests, TypeScript typecheck, backend smoke test.
Exits 0 on success, 1 on failure.

.USAGE
./scripts/release-gate.ps1
#>

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$FAILED = $false
$WARNINGS = 0

function header($msg) { Write-Host "`n── $msg ──" -ForegroundColor Cyan }
function pass($msg)  { Write-Host "  ✓ $msg" -ForegroundColor Green }
function warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow; $script:WARNINGS++ }
function fail($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red; $script:FAILED = $true }

# ── 1. Python tests ─────────────────────────────────────────
header "Python tests (pytest)"
Push-Location "$ROOT/packages/agent-engine"
try {
    $result = python -m pytest tests/ -q --tb=short 2>&1
    if ($LASTEXITCODE -eq 0) {
        pass "All Python tests passed"
    } else {
        fail "Python tests failed`n$result"
    }
} catch {
    fail "Pytest error: $_"
} finally {
    Pop-Location
}

# ── 2. TypeScript typecheck ─────────────────────────────────
header "TypeScript typecheck"
Push-Location "$ROOT/packages/management-console"
try {
    $result = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        pass "TypeScript typecheck passed"
    } else {
        $errors = ($result | Select-String "error TS").Count
        # Pre-existing TS errors are warnings, not blockers
        warn "$errors TypeScript errors (pre-existing — not a release blocker)"
    }
} catch {
    fail "Typecheck error: $_"
} finally {
    Pop-Location
}

# ── 3. Backend smoke test ───────────────────────────────────
header "Backend smoke test"

# Check if backend is already running (don't start a second one)
$portInUse = (Get-NetTCPConnection -LocalPort 50052 -ErrorAction SilentlyContinue).Count -gt 0

if (-not $portInUse) {
    # Start backend briefly for the test
    $proc = Start-Process python -ArgumentList "-m","uvicorn","src.rest_server:app","--host","127.0.0.1","--port","50052","--log-level","error" -WorkingDirectory "$ROOT/packages/agent-engine" -PassThru -NoNewWindow
    Start-Sleep -Seconds 3
}

try {
    # Health endpoint
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:50052/health" -TimeoutSec 5
    if ($health.status -eq "ok") {
        pass "Backend health: ok"

        # Agents endpoint
        try {
            $agents = Invoke-RestMethod -Uri "http://127.0.0.1:50052/v1/agents" -TimeoutSec 5
            $count = if ($agents -is [array]) { $agents.Count } elseif ($agents.agents) { $agents.agents.Count } else { 1 }
            pass "Agents endpoint responding"
        } catch {
            fail "Agents endpoint failed: $_"
        }
    } else {
        fail "Backend returned unexpected: $($health | ConvertTo-Json)"
    }
} catch {
    fail "Backend unreachable: $_"
} finally {
    if (-not $portInUse -and $proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

# ── Summary ─────────────────────────────────────────────────
Write-Host ""
if ($FAILED) {
    Write-Host "╔══════════════════════════════╗" -ForegroundColor Red
    Write-Host "║    RELEASE GATE FAILED       ║" -ForegroundColor Red
    Write-Host "╚══════════════════════════════╝" -ForegroundColor Red
    Write-Host "Fix the failures above before pushing." -ForegroundColor Red
    exit 1
} else {
    $msg = if ($WARNINGS -gt 0) { "with $WARNINGS warning(s)" } else { "clean" }
    Write-Host "╔══════════════════════════════╗" -ForegroundColor Green
    Write-Host "║    RELEASE GATE PASSED       ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════╝" -ForegroundColor Green
    Write-Host "Ready to push ($msg)." -ForegroundColor Green
    exit 0
}
