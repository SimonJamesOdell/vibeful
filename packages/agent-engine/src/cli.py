"""Vibeful CLI — single command to go from zero to working agent.

Usage:
    vibeful init [path]       Scaffold a new vibeful project
    vibeful dev                Start local dev server (SQLite, no Docker)
    vibeful dev --docker       Start with full Docker Compose stack
    vibeful chat [--agent ID]  Interactive terminal chat with an agent
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="vibeful",
        description="Vibeful — multi-tenant AI agent platform",
    )
    sub = parser.add_subparsers(dest="command")

    # init
    p_init = sub.add_parser("init", help="Scaffold a new vibeful project")
    p_init.add_argument("path", nargs="?", default=".", help="Project directory")

    # dev
    p_dev = sub.add_parser("dev", help="Start local development server")
    p_dev.add_argument("--docker", action="store_true", help="Use Docker Compose instead of SQLite")
    p_dev.add_argument("--port", type=int, default=8765, help="HTTP port (default: 8765)")

    # chat
    p_chat = sub.add_parser("chat", help="Interactive terminal chat with an agent")
    p_chat.add_argument("--agent", default="default", help="Agent ID to chat with")
    p_chat.add_argument("--model", default=None, help="Model name (default: deepseek-chat)")

    # dashboard
    p_dash = sub.add_parser("dashboard", help="Live observability dashboard")
    p_dash.add_argument("--refresh", type=float, default=2.0, help="Refresh interval in seconds")

    # export
    p_export = sub.add_parser("export", help="Export deployment configs or conversations")
    p_export.add_argument("what", choices=["helm", "docker-compose", "all", "conversations"],
                          help="What to export")
    p_export.add_argument("--output", "-o", default=".", help="Output directory or file")
    p_export.add_argument("--format", choices=["json", "csv"], default="json",
                          help="Format for conversation export")

    args = parser.parse_args()

    if args.command == "init":
        _cmd_init(args)
    elif args.command == "dev":
        asyncio.run(_cmd_dev(args))
    elif args.command == "chat":
        asyncio.run(_cmd_chat(args))
    elif args.command == "dashboard":
        asyncio.run(_cmd_dashboard(args))
    elif args.command == "export":
        if args.what == "conversations":
            asyncio.run(_cmd_export_conversations(args))
        else:
            _cmd_export(args)
    else:
        parser.print_help()


def _cmd_init(args: argparse.Namespace) -> None:
    """Scaffold a new project directory."""
    target = os.path.abspath(args.path)
    os.makedirs(target, exist_ok=True)

    env_path = os.path.join(target, ".env")
    if not os.path.exists(env_path):
        with open(env_path, "w") as f:
            f.write("# Vibeful configuration\n")
            f.write("DEEPSEEK_API_KEY=sk-your-key-here\n")
            f.write("VIBEFUL_LLM_PROVIDER=deepseek\n")
            f.write("VIBEFUL_STORAGE_BACKEND=sqlite\n")
            f.write("VIBEFUL_SQLITE_PATH=vibeful.db\n")
        print(f"  Created {env_path}")

    print(f"\n  Vibeful project ready at {target}")
    print(f"  Next: cd {target} && vibeful dev")


async def _cmd_dev(args: argparse.Namespace) -> None:
    """Start a local development server."""
    if args.docker:
        print("Starting with Docker Compose...")
        import subprocess
        subprocess.run(["docker", "compose", "up", "--build"], check=False)
        return

    # Zero-dependency mode: SQLite + in-process HTTP
    print(f"Starting Vibeful dev server (SQLite mode) on http://localhost:{args.port}")
    print("  Storage: SQLite (vibeful.db)")
    print("  LLM:     DEEPSEEK_API_KEY from environment")
    print("  No Docker, PostgreSQL, or Redis required.\n")

    try:
        from .llm import get_provider
        from .agent_graph import build_agent_graph, AgentState
        from .storage.sqlite import SqliteBackend

        # Init storage
        storage = SqliteBackend()
        await storage.init_schema()
        print("  ✓ SQLite schema initialized")

        # Warm up provider
        provider = get_provider()
        print(f"  ✓ LLM provider ready ({type(provider).__name__})")

        # Build agent graph
        graph = build_agent_graph()
        print("  ✓ Agent graph compiled (13 nodes)")

        print(f"\n  ─────────────────────────────────────")
        print(f"  Server running at http://localhost:{args.port}")
        print(f"  Press Ctrl+C to stop")
        print(f"  Run 'vibeful chat' in another terminal")
        print(f"  ─────────────────────────────────────\n")

        # Keep running
        try:
            while True:
                await asyncio.sleep(3600)
        except KeyboardInterrupt:
            print("\n  Shutting down...")
        finally:
            await storage.close()

    except ImportError as e:
        print(f"\n  Error: Missing dependency — {e}")
        print(f"  Install with: pip install vibeful-agent-engine[dev]")
        sys.exit(1)
    except Exception as e:
        print(f"\n  Error: {e}")
        sys.exit(1)


async def _cmd_chat(args: argparse.Namespace) -> None:
    """Interactive terminal chat with an agent."""
    print(f"Vibeful Chat — agent: {args.agent}")
    print('Type "quit" or "exit" to stop.\n')

    try:
        from .llm import get_provider
        from .agent_graph import build_agent_graph, AgentState

        provider = get_provider()
        graph = build_agent_graph()

        session_id = f"cli-{os.urandom(4).hex()}"
        messages: list[dict] = []

        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                break

            if user_input.lower() in ("quit", "exit", "q"):
                print("Goodbye!")
                break

            if not user_input:
                continue

            state = AgentState(
                session_id=session_id,
                user_message=user_input,
                messages=messages,
            )

            try:
                result = await graph.ainvoke(state)
            except Exception as e:
                print(f"Agent error: {e}")
                continue

            # Extract response text
            response_text = ""
            for chunk in result.get("response_chunks", []):
                if chunk.get("state") == "STREAMING":
                    response_text += chunk.get("text_chunk", "")

            if response_text:
                print(f"Agent: {response_text}")
            else:
                error = result.get("error", "No response")
                print(f"Agent [error]: {error}")

            # Update message history
            messages.append({"role": "user", "content": user_input})
            messages.append({"role": "assistant", "content": response_text})

    except ImportError as e:
        print(f"Error: Missing dependency — {e}")
        sys.exit(1)


async def _cmd_dashboard(args: argparse.Namespace) -> None:
    """Show a live-updating terminal dashboard."""
    from .dashboard import dashboard_loop
    await dashboard_loop(args.refresh)


def _cmd_export(args: argparse.Namespace) -> None:
    """Export deployment configs (Helm chart, docker-compose)."""
    import shutil

    output = args.output
    os.makedirs(output, exist_ok=True)

    deploy_dir = os.path.join(os.path.dirname(__file__), "..", "..", "deploy")
    if not os.path.isdir(deploy_dir):
        deploy_dir = os.path.join(os.getcwd(), "deploy")

    if args.format in ("helm", "all"):
        helm_src = os.path.join(deploy_dir, "helm")
        helm_dst = os.path.join(output, "helm")
        if os.path.isdir(helm_src):
            if os.path.exists(helm_dst):
                shutil.rmtree(helm_dst)
            shutil.copytree(helm_src, helm_dst)
            print(f"  Exported Helm chart to {helm_dst}/")
        else:
            print(f"  Helm chart not found at {helm_src}")

    if args.format in ("docker-compose", "all"):
        compose_src = os.path.join(deploy_dir, "docker-compose.prod.yml")
        compose_dst = os.path.join(output, "docker-compose.yml")
        if os.path.isfile(compose_src):
            shutil.copy(compose_src, compose_dst)
            print(f"  Exported docker-compose to {compose_dst}")
        else:
            print(f"  docker-compose.prod.yml not found at {compose_src}")

    deploy_src = os.path.join(deploy_dir, "deploy.sh")
    deploy_dst = os.path.join(output, "deploy.sh")
    if os.path.isfile(deploy_src):
        shutil.copy(deploy_src, deploy_dst)
        print(f"  Exported deploy script to {deploy_dst}")

    print(f"\n  Ready to deploy from {output}/")


async def _cmd_export_conversations(args: argparse.Namespace) -> None:
    """Export conversation history from the database."""
    from .storage.sqlite import SqliteBackend
    import csv
    import io

    db = SqliteBackend()
    await db.init_schema()
    conn = await db._get_conn()

    async with conn.execute(
        "SELECT id, created_at, messages_json FROM sessions ORDER BY created_at DESC"
    ) as cursor:
        rows = await cursor.fetchall()

    if args.format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["session_id", "created_at", "role", "content"])
        for row in rows:
            messages = json.loads(row["messages_json"])
            for msg in messages:
                writer.writerow([
                    row["id"], row["created_at"],
                    msg.get("role", ""), msg.get("content", ""),
                ])
        data = output.getvalue()
        ext = "csv"
    else:
        sessions = []
        for row in rows:
            sessions.append({
                "session_id": row["id"],
                "created_at": row["created_at"],
                "messages": json.loads(row["messages_json"]),
            })
        data = json.dumps(sessions, indent=2)
        ext = "json"

    out_path = args.output
    if os.path.isdir(out_path) or out_path.endswith((".json", ".csv")):
        if not out_path.endswith(f".{ext}"):
            out_path = os.path.join(out_path, f"conversations.{ext}")
    else:
        out_path = f"{out_path}.{ext}"

    with open(out_path, "w") as f:
        f.write(data)
    print(f"  Exported {len(rows)} conversations to {out_path}")
    await db.close()
