# Agent Engine Dockerfile
# Python 3.12, LangGraph, gRPC server
# Build context: vibeful root (for proto access)

FROM python:3.12-slim

WORKDIR /app

# Install system deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# Copy package config
COPY packages/agent-engine/pyproject.toml .
RUN pip install --no-cache-dir .

# Copy protos from root
COPY protos/ /app/protos/

# Copy agent-engine source
COPY packages/agent-engine/src/ /app/src/

# Generate gRPC stubs
RUN python3 -m grpc_tools.protoc \
    -I/app/protos \
    --python_out=/app/src \
    --grpc_python_out=/app/src \
    /app/protos/agent/v1/agent.proto

EXPOSE 50051

CMD ["python3", "-m", "src.main"]
