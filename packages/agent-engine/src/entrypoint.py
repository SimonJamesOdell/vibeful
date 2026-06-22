"""Unified entrypoint — starts REST and gRPC servers in one process.

Replaces the single-server CMDs in both main.py and rest_server.py
when running in Docker / production mode. Both servers share the same
agent graph and connect to the same database (PostgreSQL in Docker,
SQLite in local dev).
"""

import asyncio
import os
import sys


async def main():
    # ── Build agent graph once ─────────────────────────────────
    from src.agent_graph import build_agent_graph

    graph = build_agent_graph()
    print("[vibeful] Agent graph compiled")

    # ── Wire graph into REST server ────────────────────────────
    from src.rest_server import set_graph

    set_graph(graph)

    # ── Wire graph into gRPC server (module-level) ─────────────
    import src.main as grpc_main

    grpc_main._agent_graph = graph

    # ── Start both servers concurrently ────────────────────────
    from src.rest_server import serve_rest
    from src.main import serve as serve_grpc

    rest_port = int(os.getenv("REST_PORT", "50052"))
    grpc_port = os.getenv("GRPC_PORT", "50051")

    print(f"[vibeful] REST server starting on :{rest_port}")
    print(f"[vibeful] gRPC server starting on :{grpc_port}")

    await asyncio.gather(
        serve_rest(port=rest_port),
        serve_grpc(),
    )


if __name__ == "__main__":
    asyncio.run(main())
