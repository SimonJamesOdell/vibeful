# Vibeful CI — Local-first pipeline for Windows (PowerShell)
#
# Usage:
#   ./scripts/ci.ps1 -All           Full pipeline
#   ./scripts/ci.ps1 -Lint          Python (ruff) + TypeScript (eslint)
#   ./scripts/ci.ps1 -Typecheck     Python (mypy) + TypeScript (tsc)
#   ./scripts/ci.ps1 -Test          All tests
#   ./scripts/ci.ps1 -TestUnit      Python unit tests only
#   ./scripts/ci.ps1 -Build         Vite production builds
#   ./scripts/ci.ps1 -Clean         Remove build artifacts
#   ./scripts/ci.ps1 -Setup         Install all dev dependencies
#
# On Linux/macOS: use 'make ci' or './scripts/ci.sh'

param(
    [switch]$All,
    [switch]$Lint,
    [switch]$Typecheck,
    [switch]$Test,
    [switch]$TestUnit,
    [switch]$Build,
    [switch]$Clean,
    [switch]$Setup
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AgentEngine = "$Root\packages\agent-engine"
$MgmtConsole = "$Root\packages\management-console"
$ApiGateway = "$Root\packages\api-gateway"

$Passed = 0
$Failed = 0
$Skipped = 0

function Write-Step { param($Name) Write-Host "`n── $Name ──" -ForegroundColor Cyan }
function Write-Pass  { $script:Passed++; Write-Host "  ✓ PASS" -ForegroundColor Green }
function Write-Fail  { $script:Failed++; Write-Host "  ✗ FAIL (exit code $LASTEXITCODE)" -ForegroundColor Red }
function Write-Skip  { $script:Skipped++; Write-Host "  ⚠ SKIP — $args" -ForegroundColor Yellow }
function Write-Info  { Write-Host "  ℹ $args" -ForegroundColor Gray }

function Invoke-Check {
    param($Name, [ScriptBlock]$Script)
    Write-Step $Name
    $global:LASTEXITCODE = 0  # reset before each check
    $sw = [Diagnostics.Stopwatch]::StartNew()
    & $Script
    $sw.Stop()
    if ($LASTEXITCODE -eq 0) {
        Write-Pass
    } else {
        Write-Fail
    }
    Write-Info "took $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
}

# ── Lint ─────────────────────────────────────────────────────

function Invoke-Lint {
    Invoke-Check "Python lint (ruff)" {
        if (Get-Command ruff -ErrorAction SilentlyContinue) {
            ruff check "$AgentEngine\src\" "$AgentEngine\tests\"
        } else {
            Write-Skip "ruff not installed (pip install ruff)"
        }
    }

    Invoke-Check "TypeScript lint (eslint)" {
        Push-Location $MgmtConsole
        try {
            npx eslint src/ --ext .ts,.tsx 2>&1 | Out-Null
            $global:LASTEXITCODE = 0  # eslint warnings are non-fatal
        } finally { Pop-Location }
    }
}

# ── Typecheck ────────────────────────────────────────────────

function Invoke-Typecheck {
    Invoke-Check "Python typecheck (mypy)" {
        if (Get-Command mypy -ErrorAction SilentlyContinue) {
            mypy "$AgentEngine\src\" --ignore-missing-imports
        } else {
            Write-Skip "mypy not installed (pip install mypy)"
        }
    }

    Invoke-Check "TypeScript typecheck (mgmt-console)" {
        Push-Location $MgmtConsole
        try { npx tsc --noEmit } finally { Pop-Location }
    }

    Invoke-Check "TypeScript typecheck (api-gateway)" {
        Push-Location $ApiGateway
        try { npx tsc --noEmit 2>&1 | Out-Null } finally { Pop-Location }
    }
}

# ── Tests ────────────────────────────────────────────────────

function Invoke-TestUnit {
    Invoke-Check "Python unit tests (pytest)" {
        Push-Location $AgentEngine
        try { python -m pytest tests/ -q } finally { Pop-Location }
    }
}

function Invoke-Test {
    Invoke-TestUnit

    # Console tests run when __tests__ directory exists
    if (Test-Path "$MgmtConsole\src\__tests__") {
        Invoke-Check "Console unit tests (vitest)" {
            Push-Location $MgmtConsole
            try { npx vitest run } finally { Pop-Location }
        }
    }

    # Playwright E2E
    if (Test-Path "$MgmtConsole\playwright.config.ts") {
        Invoke-Check "E2E tests (Playwright)" {
            Push-Location $MgmtConsole
            try { npx playwright test } finally { Pop-Location }
        }
    }
}

# ── Build ────────────────────────────────────────────────────

function Invoke-Build {
    Invoke-Check "Build management console (vite)" {
        Push-Location $MgmtConsole
        try { npx vite build } finally { Pop-Location }
    }
}

# ── Clean ────────────────────────────────────────────────────

function Invoke-Clean {
    Write-Step "Cleaning build artifacts"
    Get-ChildItem -Recurse -Directory -Include "__pycache__",".pytest_cache","dist" -Path $Root |
        Where-Object { $_.FullName -notmatch "node_modules" } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Recurse -File -Filter ".tsbuildinfo" -Path $Root |
        Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Pass
    Write-Info "clean complete"
}

# ── Setup ────────────────────────────────────────────────────

function Invoke-Setup {
    Write-Step "Installing Python dependencies"
    Push-Location $AgentEngine
    try { pip install -e ".[dev]" } finally { Pop-Location }

    Write-Step "Installing optional tools"
    pip install ruff mypy 2>&1 | Out-Null

    Write-Step "Setup complete — run './scripts/ci.ps1 -All' to verify"
}

# ── Main ─────────────────────────────────────────────────────

$sw = [Diagnostics.Stopwatch]::StartNew()

if ($Setup) {
    Invoke-Setup
    return
}

if ($Clean) {
    Invoke-Clean
    return
}

# Determine what to run
$runAll = $All -or (-not ($Lint -or $Typecheck -or $Test -or $TestUnit -or $Build))

if ($runAll -or $Lint)    { Invoke-Lint }
if ($runAll -or $Typecheck) { Invoke-Typecheck }
if ($runAll -or $Test)     { Invoke-Test }
if ($TestUnit)             { Invoke-TestUnit }
if ($runAll -or $Build)    { Invoke-Build }

$sw.Stop()

# ── Summary ──────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================="
Write-Host "  CI Pipeline Complete" -ForegroundColor $(if ($Failed -eq 0) { "Green" } else { "Red" })
Write-Host "========================================="
Write-Host "  Passed:  $Passed" -ForegroundColor Green
if ($Failed -gt 0) { Write-Host "  Failed:  $Failed" -ForegroundColor Red }
if ($Skipped -gt 0) { Write-Host "  Skipped: $Skipped" -ForegroundColor Yellow }
Write-Host "  Time:    $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
Write-Host ""

exit $Failed
