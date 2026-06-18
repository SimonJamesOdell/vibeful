#!/usr/bin/env bash
# Vibeful one-click deploy script.
# Usage: bash deploy.sh [cloud] [--env-file .env.prod]
#
# Supported clouds: aws, gcp, azure, do (DigitalOcean)

set -euo pipefail

CLOUD="${1:-aws}"
ENV_FILE="${2:-.env}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[vibeful]${NC} $1"; }
ok()   { echo -e "${GREEN}[vibeful]${NC} ✓ $1"; }
err()  { echo -e "${RED}[vibeful]${NC} ✗ $1"; exit 1; }

# Load env
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

check_deps() {
  command -v docker >/dev/null 2>&1 || err "docker is required"
  command -v kubectl >/dev/null 2>&1 || log "kubectl not found — skipping k8s checks"
  ok "dependencies satisfied"
}

deploy_aws() {
  log "Deploying to AWS EKS..."
  if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
    err "DEEPSEEK_API_KEY is required. Set in $ENV_FILE or environment."
  fi

  # Create namespace
  kubectl create namespace vibeful --dry-run=client -o yaml | kubectl apply -f -

  # Create secrets
  kubectl -n vibeful create secret generic vibeful-secrets \
    --from-literal=deepseek-api-key="$DEEPSEEK_API_KEY" \
    --from-literal=postgres-password="${DB_PASSWORD:-vibeful-prod-$(openssl rand -hex 8)}" \
    --from-literal=api-keys="${VIBEFUL_API_KEYS:-sk-local-dev:Admin}" \
    --dry-run=client -o yaml | kubectl apply -f -

  # Install via Helm
  helm upgrade --install vibeful ./deploy/helm/vibeful \
    --namespace vibeful \
    --set secrets.deepseekApiKey="$DEEPSEEK_API_KEY" \
    --set secrets.postgresPassword="${DB_PASSWORD:-}" \
    --set secrets.apiKeys="${VIBEFUL_API_KEYS:-}" \
    --wait

  ok "Vibeful deployed to AWS EKS"
  log "Proxy URL: $(kubectl -n vibeful get svc vibeful-proxy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo 'pending...')"
}

deploy_gcp() {
  log "Deploying to GCP GKE..."
  deploy_aws  # Same Helm flow, different cloud
}

deploy_azure() {
  log "Deploying to Azure AKS..."
  deploy_aws
}

deploy_do() {
  log "Deploying to DigitalOcean..."
  deploy_aws
}

deploy_docker() {
  log "Deploying with Docker Compose..."
  docker compose -f deploy/docker-compose.prod.yml up -d
  ok "Vibeful running on Docker"
  log "Proxy: http://localhost:8000"
  log "Health: http://localhost:8000/health"
}

case "$CLOUD" in
  aws|gcp|azure|do)
    check_deps
    "deploy_$CLOUD"
    ;;
  docker)
    deploy_docker
    ;;
  *)
    echo "Usage: bash deploy.sh [aws|gcp|azure|do|docker]"
    ;;
esac
