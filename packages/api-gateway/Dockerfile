# API Gateway Dockerfile
# Build context: vibeful root (for workspace dependency)
FROM node:22-alpine

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/api-gateway/package.json packages/api-gateway/tsconfig.json ./packages/api-gateway/
COPY packages/api-gateway/src/ ./packages/api-gateway/src/

RUN corepack enable && pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @vibeful/shared build
RUN pnpm --filter @vibeful/api-gateway build

EXPOSE 3000
CMD ["node", "packages/api-gateway/dist/index.js"]
