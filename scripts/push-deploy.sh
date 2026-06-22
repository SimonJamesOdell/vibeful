#!/usr/bin/env bash
# Push-and-deploy — pushes to GitHub, then triggers pull + restart on the test machine.
#
# Usage:
#   bash scripts/push-deploy.sh
#
# Prerequisites on test machine:
#   - SSH server running, your key authorized

set -euo pipefail

TEST_HOST="${VIBEFUL_TEST_HOST:-192.168.0.71}"
TEST_USER="${VIBEFUL_TEST_USER:-simon}"
REPO_PATH="${VIBEFUL_REPO_PATH:-/home/simon/mindset/vibeful}"

echo "Pushing to GitHub..."
git push

echo "Deploying to test machine (${TEST_HOST})..."
ssh "${TEST_USER}@${TEST_HOST}" "
    cd '${REPO_PATH}' &&
    git pull origin master &&
    cd packages/agent-engine &&
    pip install -e . &&
    pkill -f 'uvicorn.*rest_server' || true &&
    sleep 1 &&
    VIBEFUL_STORAGE=sqlite nohup python -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052 --log-level warning > /dev/null 2>&1 &
    echo 'Deploy complete'
"

echo "Done — test machine updated and restarted"