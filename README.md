# StockRoom

Warehouse inventory for a single site: an item catalogue, per-location stock
levels, atomic goods-in / goods-out / zone-transfer movements, a low-stock
report and a filterable movement audit log.

- **Frontend** — Angular 19 standalone components + signals (`frontend/`)
- **Backend** — NestJS 11 REST API under `/api` (`backend/`)
- **Database** — PostgreSQL via Prisma (`backend/prisma/schema.prisma`)
- **Auth** — JWT bearer tokens, global `JwtAuthGuard` + `RolesGuard`

## Roles

| Role | Can do |
| --- | --- |
| `USER` (stock clerk) | Browse the catalogue and item breakdowns, record IN / OUT / TRANSFER movements |
| `MANAGER` | Everything a clerk can, plus manage items and locations, read the audit log and the low-stock report |
| `ADMIN` | Everything a manager can, plus the admin settings screen |

Accounts are **platform-owned**. Colossus injects `COLOSSUS_ACCOUNTS_JSON` at
provision and `backend/prisma/seed/seed.js` materialises one `colossus_accounts`
row and one `User` per entry, hashing with the same `bcryptjs` the auth service
verifies against. There are no built-in demo credentials; new self-service
signups are created as `USER` (the very first account in an empty database
becomes `ADMIN` so the instance is never left unadministered).

## Invariants the API enforces

- **Stock never goes negative.** An OUT or TRANSFER larger than the balance at
  the source location is refused with `400 Insufficient stock` and *nothing* is
  written — the decrement is a guarded `updateMany({ qty: { gte } })` inside the
  same transaction as the audit row, so two concurrent draw-downs can never both
  succeed.
- **Transfers conserve the total.** The source decrement and the destination
  increment share one transaction.
- **SKUs are unique.** A duplicate returns `400 sku already exists`.
- **The audit log is honest.** Deleting an item or location that appears in a
  movement is refused with `409`.

## API surface

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/api/auth/signup`, `/api/auth/login` | public |
| `GET` | `/api/auth/me` · `POST /api/auth/logout` | any signed-in |
| `GET` | `/api/items`, `/api/items/:id` | any signed-in |
| `POST` `PATCH` `DELETE` | `/api/items[/:id]` | `MANAGER` |
| `GET` | `/api/locations`, `/api/locations/:id` | any signed-in |
| `POST` `PATCH` `DELETE` | `/api/locations[/:id]` | `MANAGER` |
| `POST` | `/api/movements` | any signed-in |
| `GET` | `/api/movements` (filter by `itemId`, `type`, `from`, `to`, paged) | `MANAGER` |
| `GET` | `/api/reports/low-stock` | `MANAGER` |
| `GET` `PATCH` | `/api/admin/settings` | `ADMIN` |
| `GET` | `/api/health`, `/api/health/deep`, `/api/docs` | public |

## Local development

```bash
cp .env.example .env          # DATABASE_URL, JWT_SECRET, PORT
docker compose up --build     # db + backend + frontend on :8080
```

Or run the two halves directly:

```bash
cd backend  && npm install && npx prisma migrate deploy && npm run start:dev
cd frontend && npm install && npm start          # proxies /api to the backend
```

Readiness check: `curl localhost:3001/api/health/deep` → `{"status":"ok","db":"ok"}`.

## Tests

```bash
cd backend && npm test        # unit + guarded integration specs
```

The integration specs skip themselves when `DATABASE_URL` is unset, so the suite
is safe to run in an environment without a database.
