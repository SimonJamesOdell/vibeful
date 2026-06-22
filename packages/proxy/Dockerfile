# Proxy Dockerfile
# Build context: vibeful root
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# Copy package config and source (must copy src/ before pip install)
COPY packages/proxy/pyproject.toml .
COPY packages/proxy/src/ /app/src/
RUN pip install --no-cache-dir .

# Copy shared agent-engine modules the proxy depends on (as a proper package)
RUN mkdir -p /app/agent_engine/src
COPY packages/agent-engine/src/database.py /app/agent_engine/src/database.py
COPY packages/agent-engine/src/embeddings.py /app/agent_engine/src/embeddings.py
COPY packages/agent-engine/src/rag.py /app/agent_engine/src/rag.py
COPY packages/agent-engine/src/agent_memory.py /app/agent_engine/src/agent_memory.py
COPY packages/agent-engine/src/threads.py /app/agent_engine/src/threads.py
COPY packages/agent-engine/src/llm/ /app/agent_engine/src/llm/
COPY packages/agent-engine/src/__init__.py /app/agent_engine/src/__init__.py
RUN touch /app/agent_engine/__init__.py

# Copy proto stubs for gRPC client
COPY protos/ /app/protos/
RUN python3 -m grpc_tools.protoc \
    -I/app/protos \
    --python_out=/app/src \
    --grpc_python_out=/app/src \
    /app/protos/agent/v1/agent.proto

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
