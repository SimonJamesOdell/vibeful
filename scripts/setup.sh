#!/usr/bin/env bash
# Vibeful Setup — self-contained, zero-dependency setup script.
#
# Detects your system, installs any missing prerequisites,
# and starts the Vibeful platform. Works on Linux, macOS, and WSL.
#
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
#
# Or directly from the repo after cloning:
#   git clone https://github.com/SimonJamesOdell/vibeful.git
#   cd vibeful && bash scripts/setup.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo -e "${CYAN}${BOLD}════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  Vibeful Setup${NC}"
echo -e "${CYAN}${BOLD}════════════════════════════════════════${NC}"
echo ""

# ── 1. Detect system ──────────────────────────────────────────

OS="unknown"
PKG_MANAGER=""
INSTALL_CMD=""

if [[ "$(uname -s)" == "Linux" ]]; then
    OS="linux"
    if command -v apt-get &>/dev/null; then
        PKG_MANAGER="apt"; INSTALL_CMD="sudo apt-get install -y"
    elif command -v dnf &>/dev/null; then
        PKG_MANAGER="dnf"; INSTALL_CMD="sudo dnf install -y"
    elif command -v pacman &>/dev/null; then
        PKG_MANAGER="pacman"; INSTALL_CMD="sudo pacman -S --noconfirm"
    elif command -v apk &>/dev/null; then
        PKG_MANAGER="apk"; INSTALL_CMD="sudo apk add"
    fi
elif [[ "$(uname -s)" == "Darwin" ]]; then
    OS="macos"
    PKG_MANAGER="brew"
    INSTALL_CMD="brew install"
elif grep -qi microsoft /proc/version 2>/dev/null; then
    OS="wsl"
    if command -v apt-get &>/dev/null; then
        PKG_MANAGER="apt"; INSTALL_CMD="sudo apt-get install -y"
    fi
fi

echo -e "  ${BOLD}System detected:${NC} ${OS} ${PKG_MANAGER:+(using $PKG_MANAGER)}"
echo ""

# ── 2. Check prerequisites ─────────────────────────────────────

MISSING=()
NEEDS_INSTALL=0

check_cmd() {
    local name="$1" cmd="$2" pkg="$3"
    if command -v "$cmd" &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} ${name} found"
        return 0
    else
        echo -e "  ${YELLOW}✗${NC} ${name} not found"
        if [ -n "$pkg" ] && [ -n "$PKG_MANAGER" ]; then
            MISSING+=("${name}|${pkg}")
        fi
        NEEDS_INSTALL=1
        return 1
    fi
}

check_cmd "Python 3.10+" python3 "python3 python3-pip python3-venv"
check_cmd "pip"         pip3    "python3-pip"

# Node.js check — try node, nodejs, or offer install
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [ "${NODE_VER:-0}" -ge 18 ]; then
        echo -e "  ${GREEN}✓${NC} Node.js found (v$(node --version 2>/dev/null | sed 's/v//'))"
    else
        echo -e "  ${YELLOW}✗${NC} Node.js too old (need 18+)"
        NEEDS_INSTALL=1
    fi
elif command -v nodejs &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Node.js found (as nodejs)"
else
    echo -e "  ${YELLOW}✗${NC} Node.js not found"
    if [ "$PKG_MANAGER" = "apt" ]; then
        MISSING+=("Node.js 22|nodejs npm")
    elif [ "$PKG_MANAGER" = "brew" ]; then
        MISSING+=("Node.js 22|node")
    else
        MISSING+=("Node.js 22|nodejs")
    fi
    NEEDS_INSTALL=1
fi

# Docker is optional — only needed for production mode
DOCKER_AVAILABLE=0
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Docker found (production mode available)"
    DOCKER_AVAILABLE=1
else
    echo -e "  ${YELLOW}○${NC} Docker not found (local mode only — fine for development)"
fi

echo ""

# ── 3. Offer to install missing packages ───────────────────────

if [ $NEEDS_INSTALL -eq 1 ] && [ ${#MISSING[@]} -gt 0 ] && [ -n "$INSTALL_CMD" ]; then
    echo -e "${YELLOW}${BOLD}Some packages are missing.${NC}"
    echo ""
    echo "Missing:"
    for m in "${MISSING[@]}"; do
        IFS='|' read -r name pkg <<< "$m"
        echo "  - ${name} (package: ${pkg})"
    done
    echo ""

    if [ "$PKG_MANAGER" = "apt" ]; then
        echo "I can install them with:"
        PKGS=""
        for m in "${MISSING[@]}"; do
            IFS='|' read -r name pkg <<< "$m"
            PKGS="$PKGS $pkg"
        done
        echo -e "  ${BOLD}sudo apt-get update && sudo apt-get install -y${PKGS}${NC}"
        echo ""

        if [ "$PKG_MANAGER" = "apt" ] && ! command -v node &>/dev/null; then
            echo "For the latest Node.js (required):"
            echo -e "  ${BOLD}curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -${NC}"
            echo "  (Run this first, then the apt-get install above)"
            echo ""
        fi
    fi

    echo -e "Or install them manually and re-run this script."
    echo ""
    echo -n "Install now? [Y/n] "
    read -r REPLY
    if [ "${REPLY:-y}" = "y" ] || [ "${REPLY:-y}" = "Y" ] || [ -z "${REPLY:-}" ]; then
        echo ""
        echo "Installing..."

        # Node.js via nodesource on apt-based systems
        if [ "$PKG_MANAGER" = "apt" ] && ! command -v node &>/dev/null; then
            echo "  → Setting up Node.js 22 repository..."
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        fi

        # Update apt
        if [ "$PKG_MANAGER" = "apt" ]; then
            sudo apt-get update -qq
        fi

        # Install all packages
        PKGS=""
        for m in "${MISSING[@]}"; do
            IFS='|' read -r name pkg <<< "$m"
            PKGS="$PKGS $pkg"
        done
        $INSTALL_CMD $PKGS

        echo ""
        echo -e "${GREEN}Packages installed.${NC}"
    fi
elif [ $NEEDS_INSTALL -eq 1 ] && [ -z "$INSTALL_CMD" ]; then
    echo -e "${YELLOW}Some packages are missing. Please install them manually:${NC}"
    echo "  - Python 3.10+ with pip"
    echo "  - Node.js 22+"
    echo "Then re-run this script."
    exit 1
fi

echo ""

# ── 4. Install npm/pnpm if needed ──────────────────────────────

if ! command -v pnpm &>/dev/null && command -v npm &>/dev/null; then
    echo "Installing pnpm (Node.js package manager)..."
    npm install -g pnpm 2>/dev/null || sudo npm install -g pnpm 2>/dev/null || {
        # Enable corepack as fallback
        corepack enable pnpm 2>/dev/null || true
    }
    echo -e "  ${GREEN}✓${NC} pnpm installed"
    echo ""
fi

# ── 5. Install Vibeful dependencies ────────────────────────────

echo -e "${BOLD}Installing Vibeful dependencies...${NC}"
echo ""

echo "  → Python packages..."
cd "$ROOT/packages/agent-engine"
# Create virtual environment if needed (PEP 668 compliance)
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -e ".[dev]" 2>&1 | tail -5
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo -e "  ${RED}✗ Python install failed${NC}"
    echo "  Try manually: cd packages/agent-engine && source .venv/bin/activate && pip install -e \".[dev]\""
    exit 1
fi
cd "$ROOT"
echo -e "  ${GREEN}✓${NC} Python dependencies installed"

echo "  → Node.js packages..."
cd "$ROOT"
INSTALL_OUTPUT=$(pnpm install 2>&1) && INSTALL_OK=1 || INSTALL_OK=0
if [ "$INSTALL_OK" -eq 1 ]; then
    echo -e "  ${GREEN}✓${NC} Node.js dependencies installed"
elif echo "$INSTALL_OUTPUT" | grep -q "ERR_PNPM_MINIMUM_RELEASE_AGE\|supply-chain policy"; then
    echo -e "  ${YELLOW}⚠ Lockfile verification failed (packages published too recently). Rebuilding lockfile...${NC}"
    pnpm clean --lockfile 2>/dev/null || true
    REBUILD_OUTPUT=$(pnpm install 2>&1) && REBUILD_OK=1 || REBUILD_OK=0
    if [ "$REBUILD_OK" -eq 1 ]; then
        echo -e "  ${GREEN}✓${NC} Node.js dependencies installed (lockfile rebuilt)"
    elif echo "$REBUILD_OUTPUT" | grep -q "ERR_PNPM_IGNORED_BUILDS"; then
        echo -e "  ${GREEN}✓${NC} Node.js dependencies installed (lockfile rebuilt, build scripts skipped — run 'pnpm approve-builds' if needed)"
    else
        echo "$REBUILD_OUTPUT" | tail -20
        echo -e "  ${RED}✗ pnpm install failed after lockfile rebuild${NC}"
        echo "  Try manually: pnpm clean --lockfile && pnpm install"
        exit 1
    fi
else
    echo "$INSTALL_OUTPUT" | tail -20
    echo -e "  ${RED}✗ pnpm install failed${NC}"
    exit 1
fi
echo ""

# ── 6. Check API key ───────────────────────────────────────────

echo -e "${BOLD}Checking LLM configuration...${NC}"
echo ""

API_KEY="${DEEPSEEK_API_KEY:-}"
HAS_ENV_KEY=0

if [ -n "$API_KEY" ] && [ ${#API_KEY} -gt 20 ] && [[ "$API_KEY" != *"your-deepseek"* ]]; then
    echo -e "  ${GREEN}✓${NC} DEEPSEEK_API_KEY found in environment"
    HAS_ENV_KEY=1
elif [ -f "$ROOT/.env" ]; then
    API_KEY=$(grep DEEPSEEK_API_KEY "$ROOT/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)
    if [ -n "$API_KEY" ] && [ ${#API_KEY} -gt 20 ] && [[ "$API_KEY" != *"your-deepseek"* ]]; then
        echo -e "  ${GREEN}✓${NC} DEEPSEEK_API_KEY found in .env file"
        HAS_ENV_KEY=1
    fi
fi

if [ $HAS_ENV_KEY -eq 0 ]; then
    echo -e "  ${YELLOW}○${NC} No API key found. You'll need one to use AI agents."
    echo ""
    echo "  Get a free key at: https://platform.deepseek.com/api_keys"
    echo "  Then either:"
    echo "    1. Set it now: export DEEPSEEK_API_KEY=sk-your-key"
    echo "    2. Or paste it in the Management Console when prompted"
    echo ""
    echo -n "  Have a key? Paste it now (or press Enter to skip): "
    read -r KEY_INPUT
    if [ -n "$KEY_INPUT" ] && [ ${#KEY_INPUT} -gt 10 ]; then
        export DEEPSEEK_API_KEY="$KEY_INPUT"
        # Persist to .env so future runs don't ask again
        {
            if [ -f "$ROOT/.env" ]; then
                grep -v "^DEEPSEEK_API_KEY=" "$ROOT/.env" 2>/dev/null || true
            fi
            echo "DEEPSEEK_API_KEY=$KEY_INPUT"
        } > "$ROOT/.env.tmp" && mv "$ROOT/.env.tmp" "$ROOT/.env"
        chmod 600 "$ROOT/.env" 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} Key saved to .env for future runs"
    fi
else
    export DEEPSEEK_API_KEY="$API_KEY"
fi

echo ""

# ── 7. Start Vibeful ───────────────────────────────────────────

echo -e "${BOLD}Starting Vibeful...${NC}"
echo ""

# Kill any previous instances
pkill -f "uvicorn.*rest_server" 2>/dev/null || true
pkill -f "vite.*management" 2>/dev/null || true
sleep 1

# Start agent engine in background
echo "  → Starting agent engine (port 50052)..."
cd "$ROOT/packages/agent-engine"
if [ -f ".venv/bin/python" ]; then
    VENV_PYTHON=".venv/bin/python"
else
    VENV_PYTHON="python3"
fi
VIBEFUL_STORAGE=sqlite \
    $VENV_PYTHON -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052 \
    --log-level warning &
AGENT_PID=$!
cd "$ROOT"

# Wait for agent engine to be ready
echo "  → Waiting for agent engine..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:50052/health 2>/dev/null | grep -q '"ok"'; then
        echo -e "  ${GREEN}✓${NC} Agent engine ready"
        break
    fi
    sleep 1
done

# Start management console in background
echo "  → Starting management console (port 5174)..."
cd "$ROOT/packages/management-console"
pnpm dev --host 0.0.0.0 --port 5174 &
CONSOLE_PID=$!
cd "$ROOT"

sleep 2

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Vibeful is Ready${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo ""
echo "  Management Console:  http://localhost:5174"
echo "  Agent Engine API:    http://localhost:50052"
echo ""
echo "  The Vibeful Guide will greet you when you open the console."
if [ $HAS_ENV_KEY -eq 0 ] && [ -z "${KEY_INPUT:-}" ]; then
    echo "  ${YELLOW}⚠ You'll need to paste your API key in the console.${NC}"
fi
echo ""
echo "  To stop: press Ctrl+C or run:"
echo "    kill $AGENT_PID $CONSOLE_PID 2>/dev/null"
echo ""

# Wait for either process to exit
wait