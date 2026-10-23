# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate

# Stage 1: Dependencies
FROM base AS deps
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/i18n/package.json packages/i18n/
COPY packages/storage/package.json packages/storage/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
COPY apps/seller/package.json apps/seller/

RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_OUTPUT_STANDALONE=true
ENV NODE_ENV=production

RUN pnpm --filter @simply/seller build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache wget

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs -G nodejs

# Copy static assets and standalone bundle
COPY --from=builder /app/apps/seller/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/seller/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/seller/.next/static ./apps/seller/.next/static

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/ || exit 1

CMD ["node", "apps/seller/server.js"]
