#!/usr/bin/env python3
"""Polling auto-deploy — watches GitHub for new commits and deploys on change.

Runs on the test machine inside the LAN. Fetches the remote every N seconds.
When new commits are detected on master, pulls and restarts services.

No public IP needed. No webhook configuration. Just start it and leave it running.

Usage on test machine:
    python scripts/watch-deploy.py --interval 30
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(cmd: str, cwd: str = REPO_ROOT) -> tuple[int, str]:
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=120
        )
        return result.returncode, result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        return 1, str(e)


def get_remote_hash() -> str | None:
    """Get the latest commit hash on origin/master without pulling."""
    code, out = run("git fetch origin master 2>&1")
    if code != 0:
        return None
    code, out = run("git rev-parse origin/master")
    return out.strip() if code == 0 else None


def get_local_hash() -> str | None:
    code, out = run("git rev-parse HEAD")
    return out.strip() if code == 0 else None


def deploy() -> bool:
    """Pull and restart. Returns True if anything changed."""
    code, out = run("git pull origin master")
    print(f"  [git pull] {out[:200]}")

    if "Already up to date" in out or code != 0:
        return False

    # Reinstall Python package
    code, out = run(
        "pip install -e .",
        cwd=os.path.join(REPO_ROOT, "packages", "agent-engine"),
    )
    print(f"  [pip install] {'OK' if code == 0 else 'FAILED'}")

    # Restart agent engine
    if sys.platform == "win32":
        run("taskkill /F /IM python.exe /FI \"WINDOWTITLE eq *uvicorn*\" 2>nul", cwd=REPO_ROOT)
        time.sleep(1)
        subprocess.Popen(
            [
                "python", "-m", "uvicorn", "src.rest_server:app",
                "--host", "127.0.0.1", "--port", "50052", "--log-level", "warning",
            ],
            cwd=os.path.join(REPO_ROOT, "packages", "agent-engine"),
            env={**os.environ, "VIBEFUL_STORAGE": "sqlite"},
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    else:
        run("pkill -f 'uvicorn.*rest_server' || true", cwd=REPO_ROOT)
        time.sleep(1)
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

    print("  [deploy] Agent engine restarted")
    return True


def main():
    parser = argparse.ArgumentParser(description="Vibeful polling auto-deploy")
    parser.add_argument("--interval", type=int, default=30, help="Poll interval in seconds")
    args = parser.parse_args()

    print(f"[watcher] Polling every {args.interval}s — Ctrl+C to stop")
    print(f"[watcher] Repo: {REPO_ROOT}")

    while True:
        try:
            remote = get_remote_hash()
            local = get_local_hash()

            if remote and local and remote != local:
                print(f"\n[watcher] New commits detected ({local[:8]} → {remote[:8]}) — deploying...")
                deploy()
            else:
                print(f"[watcher] Up to date ({local[:8] if local else '?'})", end="\r")

            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n[watcher] Stopped")
            break
        except Exception as e:
            print(f"\n[watcher] Error: {e}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()