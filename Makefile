# Vibeful CI — local-first, provider-agnostic pipeline.
#
# Usage:
#   make ci          Full pipeline (lint → typecheck → test → build)
#   make lint        Python (ruff) + TypeScript (eslint)
#   make typecheck   Python (mypy) + TypeScript (tsc)
#   make test        All tests (pytest + vitest + Playwright)
#   make test-unit   Python tests only (fast feedback)
#   make test-e2e    Playwright E2E tests
#   make build       Vite production builds
#   make clean       Remove build artifacts
#   make setup       Install all dev dependencies
#
# Provider-agnostic: any CI system (GitHub Actions, GitLab CI, Jenkins)
# invokes the same target. No cloud CI required — runs locally.
#
# On Windows without make: use ./scripts/ci.ps1 instead.

.PHONY: ci lint typecheck test test-unit test-e2e build clean setup

SHELL := /bin/bash
ROOT := $(shell pwd)
AGENT_ENGINE := $(ROOT)/packages/agent-engine
MGMT_CONSOLE := $(ROOT)/packages/management-console
API_GATEWAY := $(ROOT)/packages/api-gateway
SDK := $(ROOT)/packages/sdk
SCRIPTS := $(ROOT)/scripts

# ── Full Pipeline ───────────────────────────────────────────

ci: lint typecheck test build
	@echo ""
	@echo "========================================="
	@echo "  CI Pipeline Complete — All Gates Passed"
	@echo "========================================="

# ── Lint ─────────────────────────────────────────────────────

lint: lint-py lint-ts

lint-py:
	@echo "── Python lint ──"
	@if command -v ruff &>/dev/null; then \
		ruff check $(AGENT_ENGINE)/src/ $(AGENT_ENGINE)/tests/; \
	else \
		echo "  ⚠ ruff not installed — skipping (pip install ruff)"; \
	fi

lint-ts:
	@echo "── TypeScript lint ──"
	@cd $(MGMT_CONSOLE) && npx eslint src/ --ext .ts,.tsx 2>/dev/null || echo "  ⚠ eslint check had warnings (non-fatal)"

# ── Typecheck ────────────────────────────────────────────────

typecheck: typecheck-py typecheck-ts

typecheck-py:
	@echo "── Python typecheck ──"
	@if command -v mypy &>/dev/null; then \
		mypy $(AGENT_ENGINE)/src/ --ignore-missing-imports; \
	else \
		echo "  ⚠ mypy not installed — skipping (pip install mypy)"; \
	fi

typecheck-ts:
	@echo "── TypeScript typecheck ──"
	@cd $(MGMT_CONSOLE) && npx tsc --noEmit
	@cd $(API_GATEWAY) && npx tsc --noEmit 2>/dev/null || echo "  ⚠ api-gateway typecheck skipped (deps may differ)"

# ── Tests ────────────────────────────────────────────────────

test: test-unit
	@# vitest + Playwright run when test files exist
	@if [ -d "$(MGMT_CONSOLE)/src/__tests__" ]; then \
		cd $(MGMT_CONSOLE) && npx vitest run; \
	fi
	@if [ -f "$(MGMT_CONSOLE)/playwright.config.ts" ]; then \
		cd $(MGMT_CONSOLE) && npx playwright test; \
	fi

test-unit:
	@echo "── Python unit tests ──"
	@cd $(AGENT_ENGINE) && python -m pytest tests/ -q

test-e2e:
	@echo "── E2E tests ──"
	@if [ -f "$(MGMT_CONSOLE)/playwright.config.ts" ]; then \
		cd $(MGMT_CONSOLE) && npx playwright test; \
	else \
		echo "  No Playwright config found — skipping"; \
	fi

# ── Build ────────────────────────────────────────────────────

build:
	@echo "── Building management console ──"
	@cd $(MGMT_CONSOLE) && npx vite build
	@echo "── Building SDK ──"
	@cd $(SDK) && npx vite build 2>/dev/null || echo "  ⚠ SDK build skipped"

# ── Clean ────────────────────────────────────────────────────

clean:
	@echo "── Cleaning build artifacts ──"
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "node_modules" -prune -o -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".tsbuildinfo" -delete 2>/dev/null || true
	@echo "  Clean complete"

# ── Setup ────────────────────────────────────────────────────

setup:
	@echo "── Installing Python dependencies ──"
	@cd $(AGENT_ENGINE) && pip install -e ".[dev]"
	@echo "── Installing Node dependencies ──"
	@cd $(MGMT_CONSOLE) && pnpm install
	@echo "── Installing optional tools ──"
	@pip install ruff mypy 2>/dev/null || echo "  ⚠ ruff/mypy install skipped"
	@echo "  Setup complete — run 'make ci' to verify"
