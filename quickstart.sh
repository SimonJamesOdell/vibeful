#!/usr/bin/env bash
# Vibeful Quickstart — one-command complete setup with verification.
# Usage: bash quickstart.sh [--skip-verify] [--agent-name "My Agent"]
set -euo pipefail

SKIP_VERIFY=false
AGENT_NAME="Vibeful Helper"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-verify) SKIP_VERIFY=true; shift ;;
        --agent-name) AGENT_NAME="$2"; shift 2 ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

echo ""
echo "========================================="
echo "  Vibeful — One-Command Quickstart"
echo "  A CMS for AI Agents"
echo "========================================="
echo ""

# ── Prerequisites ─────────────────────────────────────────────
info "Checking prerequisites..."

command -v docker &>/dev/null || err "Docker not found → https://docs.docker.com/get-docker/"
docker info &>/dev/null || err "Docker daemon not running. Start Docker first."
log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── .env Setup ────────────────────────────────────────────────
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        log "Created .env from template"
    else
        cat > .env <<'EOF'
DEEPSEEK_API_KEY=sk-your-key-here
EOF
        log "Created minimal .env"
    fi
fi

if grep -q "sk-your-key-here\|your-deepseek-api-key-here" .env 2>/dev/null; then
    err "Set DEEPSEEK_API_KEY in .env → https://platform.deepseek.com/api_keys"
fi
log "API key configured"

# ── Pull + Build + Start ──────────────────────────────────────
info "Pulling base images..."
docker compose pull postgres redis envoy 2>/dev/null || true
log "Base images ready"

info "Building Vibeful (this may take ~2 min first time)..."
docker compose build --quiet 2>&1 | tail -1
log "Images built"

info "Starting services..."
docker compose up -d --wait 2>&1
log "All services started"

# ── Health Check ──────────────────────────────────────────────
info "Waiting for services to be healthy..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
        log "Proxy healthy"
        break
    fi
    sleep 2
done
curl -sf http://localhost:8000/health >/dev/null 2>&1 || err "Proxy failed to start. Run: docker compose logs proxy"

# ── Verification (unless skipped) ─────────────────────────────
if [ "$SKIP_VERIFY" = false ]; then
    info "Running verification..."

    AGENT_RESP=$(curl -sf -X POST http://localhost:8000/v1/agents \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$AGENT_NAME\",\"system_prompt\":\"You are a helpful assistant. Be concise.\",\"model\":\"deepseek-chat\"}")
    AGENT_ID=$(echo "$AGENT_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    log "Agent created: $AGENT_NAME ($AGENT_ID)"

    SESSION_RESP=$(curl -sf -X POST http://localhost:8000/v1/sessions \
        -H "Content-Type: application/json" \
        -d "{\"agent_id\":\"$AGENT_ID\"}")
    SESSION_ID=$(echo "$SESSION_RESP" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
    log "Session created"

    CONV_RESP=$(curl -sf -X POST "http://localhost:8000/v1/sessions/$SESSION_ID/converse" \
        -H "Content-Type: application/json" \
        -d '{"content":"Hello! What can you help me with?"}')
    if echo "$CONV_RESP" | grep -q "STREAMING"; then
        TOKENS=$(echo "$CONV_RESP" | grep -o '"total_tokens":[0-9]*' | tail -1 | cut -d: -f2)
        COST=$(echo "$CONV_RESP" | grep -o '"cost_usd":[0-9.]*' | tail -1 | cut -d: -f2)
        log "Conversation verified — $TOKENS tokens, \$$COST"
    else
        warn "Conversation check returned unexpected response"
    fi
fi

# ── Done ──────────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  Vibeful is running!"
echo "========================================="
echo ""
echo "  Admin Panel:  http://localhost:5173"
echo "  API Gateway:  http://localhost:3000"
echo "  Proxy:        http://localhost:8000"
echo ""
echo "  Stop:         docker compose down"
echo "  Logs:         docker compose logs -f"
echo "  Restart:      docker compose restart"
echo ""
echo "  Quick test:   curl http://localhost:8000/v1/agents"
echo ""
