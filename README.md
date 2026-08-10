# Eike — Next.js + PostgreSQL

Reescritura del tiquetero Eike (hoy en producción como PHP + MariaDB en
`eike.com.py`) sobre Next.js (App Router) + PostgreSQL, desplegado en GCP.

Este repo es la migración; el proyecto PHP original sigue vivo en producción
hasta el cutover. Ver el plan completo de la migración (contexto, decisiones,
esquema, fases y riesgos) — pedíselo a Claude Code si no lo tenés a mano.

## Desarrollo local

```bash
cp .env.example .env          # completar SESSION_SECRET
pnpm install
pnpm db:up                    # levanta Postgres + Adminer (docker/compose.dev.yml)
pnpm db:generate && pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

Adminer (administrador de la base) queda en `http://localhost:8082`
(sistema: PostgreSQL, servidor: `db`, usuario/clave: `eike` / `eike_local`).

## Stack

Next.js 16 (App Router) + React 19 + TypeScript · Drizzle ORM + PostgreSQL 17 ·
Tailwind v4 (tokens del diseño oscuro/cyan aprobado, en `src/app/globals.css`) ·
`iron-session` + `bcryptjs` para auth · Zod para validación · Docker Compose +
Caddy para producción en una VM de GCP.

## Despliegue (Fase 7)

Producción corre en `eike-vm` (GCP, e2-micro, IP fija `34.56.167.44` — sin
dominio todavía, se prueba directo por IP) con Docker Compose:
`caddy` (:80) → `web` (esta imagen) → `db` (postgres:17-alpine).

**CI/CD** (`.github/workflows/deploy.yml`): push a `main` arma la imagen,
la sube a Artifact Registry (`us-central1-docker.pkg.dev/eike-503422/eike/web`)
autenticando por Workload Identity Federation (sin claves de service account),
y despliega en la VM por SSH con una clave dedicada (`ghdeploy`). Requiere estos
secrets en el repo de GitHub — pedirle los valores reales a quien preparó la
infraestructura, no viven en este README:

- `VM_HOST` — IP de la VM.
- `VM_SSH_PRIVATE_KEY` — clave privada del usuario `ghdeploy` (ed25519).

**Deploy manual** (sin esperar a CI), desde la VM:

```bash
cd /opt/eike
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml run --rm \
  -e DATABASE_URL=postgres://eike:$POSTGRES_PASSWORD@db:5432/eike \
  web npx drizzle-kit migrate
docker compose -f compose.prod.yml up -d
```

`/opt/eike/.env` (no se commitea) tiene `POSTGRES_PASSWORD`, `SESSION_SECRET`,
`SITE_URL` y `COOKIE_SECURE` (en `false` hasta el cutover con dominio y HTTPS
reales — una cookie `Secure` se descarta en HTTP plano). Backups diarios
(`docker/backup.sh`, cron 6am) de la base y los uploads van a
`gs://eike-503422-backups` con expiración a 30 días.

## Estructura

- `src/app/` — rutas (App Router): `(publico)` indexable/SSR, `(panel)` privado.
- `src/db/` — esquema Drizzle y cliente de conexión.
- `src/lib/` — constantes de dominio, auth, validaciones, utilidades.
- `src/componentes/` — UI compartida (design system del artifact aprobado).
- `scripts/` — migración de datos MariaDB → Postgres, seed.
- `docker/` — compose de desarrollo y de producción, Dockerfile, Caddyfile.
