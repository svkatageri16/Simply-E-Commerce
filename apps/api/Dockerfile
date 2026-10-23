# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install OpenSSL, libc6-compat and ca-certificates for Prisma and HTTPS calls
RUN apk add --no-cache libc6-compat openssl ca-certificates
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate

# Stage 1: Install dependencies based on pnpm-lockfile
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
COPY apps/api/package.json apps/api/
COPY apps/storefront/package.json apps/storefront/
COPY apps/seller/package.json apps/seller/
COPY apps/admin/package.json apps/admin/

RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .

# Generate Prisma Client & compile shared packages + NestJS API
RUN pnpm --filter @simply/db generate
RUN pnpm --filter @simply/storage build
RUN pnpm --filter @simply/api build

# Prune dev dependencies for production runtime
RUN pnpm --filter @simply/api --prod deploy /app/pruned

# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl wget ca-certificates

ENV NODE_ENV=production
ENV PORT=4000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 simply -G nodejs

# Copy pruned production deployment
COPY --from=builder --chown=simply:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=simply:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=simply:nodejs /app/packages ./packages
COPY --from=builder --chown=simply:nodejs /app/apps/api/package.json ./package.json

USER simply

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4000}/health || exit 1

CMD ["node", "dist/main.js"]
