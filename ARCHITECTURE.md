# Architecture

## Stack

Requested stack: **enterprise** (Angular 19 + NestJS + tRPC + Prisma + PostgreSQL).

This project directory was empty of source files prior to scaffolding (only `.git`, `.github`,
and a stub `README.md` existed), so the full `enterprise` template was newly scaffolded at the
project root.

| Platform | Status | Location |
|---|---|---|
| enterprise (frontend) | ✅ newly scaffolded | `frontend/` (Angular 19 standalone components) |
| enterprise (backend)  | ✅ newly scaffolded | `backend/` (NestJS + tRPC + Prisma) |

## Template source

Copied from `/app/scaffold-templates/template-enterprise/`.

## Generated pipeline files

- `.pipeline/surface.json` — machine-readable manifest of routes, components, and
  `data-testid` values from the scaffolded template. The test_spec agent and Playwright
  generator read this as the contract for what UI/API surface exists. Update it (or have the
  coder agent update it) whenever routes/components/testids are added.
- `.colossus-acceptance.json` — post-deploy render-gate contract. `ready_testid: "app-ready"`
  is the hydration landmark on `app-root` — do not remove that attribute. `expect_text` is
  intentionally empty; the coder agent must fill it in with real front-page content once the
  StockRoom feature build replaces the template's default "Users" list page.
- `colossus.yaml` — build manifest read by deploy agents (framework: angular, output dir
  `dist/frontend/browser`, paired NestJS backend on port 3001).
- `ATLAS_STACK.md` — greenfield verdict for downstream agents.

## Next steps for the developer / build agent

1. Implement the StockRoom feature plan on top of this scaffold (items, locations,
   movements, reports, auth) per the technical plan — the template currently only contains
   the default tRPC `users` demo module and must be extended/replaced.
2. Copy environment templates if/when added (`cp .env.template .env`,
   `cp backend/.env.template backend/.env`) — none exist in this template yet, so backend
   config currently relies on defaults in `docker-compose.yml` / `main.ts`.
3. Install dependencies: `cd backend && npm install`, `cd frontend && npm install`.
4. Start local Postgres: `docker compose up -d postgres` (also starts `pgadmin` on `:5050`).
5. Run Prisma migrations once the schema is authored: `cd backend && npx prisma migrate dev`.
6. Run the backend (`npm run start:dev` in `backend/`) and frontend (`npm start` in
   `frontend/`) dev servers.
7. Keep `frontend/package.json` dependencies verbatim unless a new dependency is genuinely
   required — the frontend Dockerfile relies on a prebaked `node_modules` seed matching the
   template's exact dependency set.
