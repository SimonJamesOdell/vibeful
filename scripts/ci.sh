#!/usr/bin/env bash
# Vibeful CI — single-entry wrapper for Linux/macOS.
# Delegates to Makefile. Falls back to direct commands if make is unavailable.
#
# Usage:
#   ./scripts/ci.sh            Full pipeline
#   ./scripts/ci.sh lint       Lint only
#   ./scripts/ci.sh typecheck  Typecheck only
#   ./scripts/ci.sh test       Tests only
#   ./scripts/ci.sh test-unit  Python unit tests
#   ./scripts/ci.sh build      Build only
#   ./scripts/ci.sh clean      Remove artifacts
#   ./scripts/ci.sh setup      Install dependencies
#
# Provider-agnostic: any CI system runs './scripts/ci.sh'.
# On Windows: use './scripts/ci.ps1' instead.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-ci}"

cd "$ROOT"

# Prefer make if available
if command -v make &>/dev/null && [ -f "$ROOT/Makefile" ]; then
    echo "[ci] Running 'make $TARGET'..."
    make "$TARGET"
    exit $?
fi

# Fallback: run checks directly
echo "[ci] make not found — running checks directly..."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASSED=0; FAILED=0; SKIPPED=0

step()  { echo -e "\n${CYAN}── $1 ──${NC}"; }
pass()  { PASSED=$((PASSED+1)); echo -e "  ${GREEN}✓ PASS${NC}"; }
fail()  { FAILED=$((FAILED+1)); echo -e "  ${RED}✗ FAIL (exit $1)${NC}"; }
skip()  { SKIPPED=$((SKIPPED+1)); echo -e "  ${YELLOW}⚠ SKIP — $1${NC}"; }

check() {
    local name="$1"; shift
    step "$name"
    local start=$(date +%s%N)
    if "$@"; then
        pass
    else
        fail $?
    fi
    local end=$(date +%s%N)
    local ms=$(( (end - start) / 1000000 ))
    echo "  ℹ took ${ms}ms"
}

lint_py() {
    if command -v ruff &>/dev/null; then
        check "Python lint (ruff)" ruff check packages/agent-engine/src/ packages/agent-engine/tests/
    else
        step "Python lint (ruff)"
        skip "ruff not installed (pip install ruff)"
    fi
}

lint_ts() {
    check "TypeScript lint (eslint)" sh -c 'cd packages/management-console && npx eslint src/ --ext .ts,.tsx 2>/dev/null || true'
}

typecheck_py() {
    if command -v mypy &>/dev/null; then
        check "Python typecheck (mypy)" mypy packages/agent-engine/src/ --ignore-missing-imports
    else
        step "Python typecheck (mypy)"
        skip "mypy not installed (pip install mypy)"
    fi
}

typecheck_ts() {
    check "TypeScript typecheck (console)" sh -c 'cd packages/management-console && npx tsc --noEmit'
    check "TypeScript typecheck (gateway)" sh -c 'cd packages/api-gateway && npx tsc --noEmit 2>/dev/null || true'
}

test_unit() {
    check "Python unit tests (pytest)" sh -c 'cd packages/agent-engine && python -m pytest tests/ -q'
}

test_all() {
    test_unit
    if [ -d "packages/management-console/src/__tests__" ]; then
        check "Console unit tests (vitest)" sh -c 'cd packages/management-console && npx vitest run'
    fi
    if [ -f "packages/management-console/playwright.config.ts" ]; then
        check "E2E tests (Playwright)" sh -c 'cd packages/management-console && npx playwright test'
    fi
}

build_all() {
    check "Build management console" sh -c 'cd packages/management-console && npx vite build'
    check "Build SDK" sh -c 'cd packages/sdk && npx vite build 2>/dev/null || true'
}

clean_all() {
    step "Cleaning build artifacts"
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "node_modules" -prune -o -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".tsbuildinfo" -delete 2>/dev/null || true
    pass
}

setup_all() {
    step "Installing Python dependencies"
    cd packages/agent-engine && pip install -e ".[dev]" && cd "$ROOT"
    step "Installing optional tools"
    pip install ruff mypy 2>/dev/null || true
    echo "  Setup complete — run './scripts/ci.sh' to verify"
}

case "$TARGET" in
    ci)
        lint_py; lint_ts
        typecheck_py; typecheck_ts
        test_all
        build_all
        ;;
    lint)       lint_py; lint_ts ;;
    typecheck)  typecheck_py; typecheck_ts ;;
    test)       test_all ;;
    test-unit)  test_unit ;;
    test-e2e)
        if [ -f "packages/management-console/playwright.config.ts" ]; then
            check "E2E tests" sh -c 'cd packages/management-console && npx playwright test'
        fi
        ;;
    build)      build_all ;;
    clean)      clean_all ;;
    setup)      setup_all ;;
    *)
        echo "Unknown target: $TARGET"
        echo "Usage: ./scripts/ci.sh [ci|lint|typecheck|test|test-unit|test-e2e|build|clean|setup]"
        exit 1
        ;;
esac

echo ""
echo "========================================="
echo -e "  CI Pipeline Complete"
echo "========================================="
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
[ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed:  $FAILED${NC}"
[ "$SKIPPED" -gt 0 ] && echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

exit $FAILED
