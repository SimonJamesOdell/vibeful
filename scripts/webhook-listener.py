#!/usr/bin/env python3
"""GitHub webhook listener — auto-deploys Vibeful on push events.

Starts a lightweight HTTP server that listens for GitHub push webhooks.
When a push to master is received, runs git pull and restarts services.

Usage on test machine:
    python scripts/webhook-listener.py --port 9000

Then configure GitHub webhook:
    Settings → Webhooks → Add webhook
    Payload URL: http://192.168.0.16:9000/webhook
    Content type: application/json
    Events: Just the push event
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET = os.getenv("VIBEFUL_WEBHOOK_SECRET", "")


def run(cmd: str, cwd: str = REPO_ROOT) -> tuple[int, str]:
    """Run a shell command and return (exit_code, output)."""
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=120
        )
        return result.returncode, result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        return 1, str(e)


def deploy() -> str:
    """Pull latest code and restart services."""
    lines: list[str] = []

    # Git pull
    code, out = run("git pull origin master")
    lines.append(f"[git pull] {'OK' if code == 0 else 'FAILED'}: {out[:200]}")

    # Check if anything changed
    if "Already up to date" in out:
        lines.append("[deploy] No changes — skipping restart")
        return "\n".join(lines)

    # Reinstall Python package if changed
    py_changed = any(
        f.startswith("packages/agent-engine/") for f in _changed_files(out)
    )
    if py_changed:
        code, out = run(
            "pip install -e .",
            cwd=os.path.join(REPO_ROOT, "packages", "agent-engine"),
        )
        lines.append(f"[pip install] {'OK' if code == 0 else 'FAILED'}")

    # Restart agent engine (Windows)
    if sys.platform == "win32":
        run("taskkill /F /FI \"WINDOWTITLE eq *uvicorn*\" 2>nul", cwd=REPO_ROOT)
        _start_agent_windows()
    else:
        run("pkill -f 'uvicorn.*rest_server' || true", cwd=REPO_ROOT)
        _start_agent_unix()

    lines.append("[deploy] Restarted agent engine")
    return "\n".join(lines)


def _changed_files(git_output: str) -> list[str]:
    """Extract changed file paths from git pull output."""
    files = []
    for line in git_output.split("\n"):
        line = line.strip()
        if line and "|" in line and not line.startswith("Updating") and not line.startswith("Fast-forward"):
            parts = line.split("|")[0].strip()
            if parts:
                files.append(parts)
    return files


def _start_agent_windows():
    """Start agent engine in background on Windows."""
    subprocess.Popen(
        [
            "python", "-m", "uvicorn", "src.rest_server:app",
            "--host", "127.0.0.1", "--port", "50052", "--log-level", "warning",
        ],
        cwd=os.path.join(REPO_ROOT, "packages", "agent-engine"),
        env={**os.environ, "VIBEFUL_STORAGE": "sqlite"},
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


def _start_agent_unix():
    """Start agent engine in background on Unix."""
    subprocess.Popen(
        [
            "python", "-m", "uvicorn", "src.rest_server:app",
            "--host", "127.0.0.1", "--port", "50052", "--log-level", "warning",
        ],
        cwd=os.path.join(REPO_ROOT, "packages", "agent-engine"),
        env={**os.environ, "VIBEFUL_STORAGE": "sqlite"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Verify signature if secret is set
        if SECRET:
            signature = self.headers.get("X-Hub-Signature-256", "")
            expected = "sha256=" + hmac.new(
                SECRET.encode(), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(signature, expected):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"Invalid signature")
                return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        # Check if it's a push to master
        ref = payload.get("ref", "")
        if ref != "refs/heads/master":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Skipped — not master branch")
            return

        print(f"[webhook] Push to master detected — deploying...")
        result = deploy()
        print(result)

        self.send_response(200)
        self.end_headers()
        self.wfile.write(result.encode())

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"webhook-listener ok")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[webhook] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Vibeful webhook listener")
    parser.add_argument("--port", type=int, default=9000, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), WebhookHandler)
    print(f"[webhook] Listening on {args.host}:{args.port}")
    print(f"[webhook] Repo: {REPO_ROOT}")
    print(f"[webhook] Secret: {'configured' if SECRET else 'none (set VIBEFUL_WEBHOOK_SECRET)'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[webhook] Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()