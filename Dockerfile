# syntax=docker/dockerfile:1

# Build multi-stage pensado para la VM e2-micro (1 GB RAM): la imagen final
# corre "node server.js" (salida standalone de Next), que es lo único que
# pesa en RAM en tiempo de ejecución. Ver plan de migración §Infraestructura.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build "colecciona" los módulos de cada ruta (los importa para
# inspeccionarlos), y src/lib/auth/sesion.ts valida SESSION_SECRET al cargar
# el módulo — hace falta un valor con pinta válida en build, aunque nunca se
# use: en runtime el contenedor lee el SESSION_SECRET real desde el compose.
ENV SESSION_SECRET="valor-dummy-solo-para-el-build-de-next-32ch"
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# node_modules completo (incluye drizzle-kit) para poder correr
# "npx drizzle-kit migrate" con la misma imagen antes de levantar el server.
# No pesa en RAM: el proceso "node server.js" solo carga lo que importa.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
