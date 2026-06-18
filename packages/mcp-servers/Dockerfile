# MCP Server Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/mcp-servers/package.json packages/mcp-servers/tsconfig.json ./packages/mcp-servers/
COPY packages/mcp-servers/src/ ./packages/mcp-servers/src/

RUN corepack enable && pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @vibeful/shared build
RUN pnpm --filter @vibeful/mcp-servers build

ENV MCP_PORT=3100
ENV MCP_SERVICE=web-search

EXPOSE 3100
CMD ["node", "packages/mcp-servers/dist/index.js"]
