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

## Estructura

- `src/app/` — rutas (App Router): `(publico)` indexable/SSR, `(panel)` privado.
- `src/db/` — esquema Drizzle y cliente de conexión.
- `src/lib/` — constantes de dominio, auth, validaciones, utilidades.
- `src/componentes/` — UI compartida (design system del artifact aprobado).
- `scripts/` — migración de datos MariaDB → Postgres, seed.
- `docker/` — compose de desarrollo y de producción, Dockerfile, Caddyfile.
