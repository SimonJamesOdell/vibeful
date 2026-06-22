# Management Console Dockerfile (dev mode)
# Build context: vibeful root
FROM node:22-alpine

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/management-console/package.json packages/management-console/tsconfig.json packages/management-console/vite.config.ts packages/management-console/index.html ./packages/management-console/
COPY packages/management-console/src/ ./packages/management-console/src/
COPY packages/management-console/public/ ./packages/management-console/public/

RUN corepack enable && pnpm install --no-frozen-lockfile --ignore-scripts

EXPOSE 5174

ENV VITE_API_URL=http://agent-engine:50052

CMD ["pnpm", "--filter", "@vibeful/management-console", "dev", "--host", "0.0.0.0", "--port", "5174"]
