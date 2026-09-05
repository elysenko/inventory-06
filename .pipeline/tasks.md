# Pipeline Task Decomposition

## Summary
StockRoom is a warehouse inventory app: a NestJS + Prisma/Postgres JWT-authenticated REST API under `/api` and an Angular 19 standalone/signals SPA. It manages an item catalog (SKU, unit, `reorderAt`), locations (`Zone A/B/C`), per-location stock levels, and atomic `IN` / `OUT` / `TRANSFER` movements that update balances and write an audit row in a single transaction. Managers additionally get a filterable movement audit log, a low-stock report (`totalQty <= reorderAt`), location administration, and an admin settings page for backing-service credentials. Auth model is `full_auth`: signup/login are public, every other route is guarded, the first user is an admin-tier account and later signups default to the clerk/user role.

## Surface contract

### Roles
`ADMIN` (platform admin), `MANAGER` (spec "manager"; admin-tier privileges), `CLERK` (spec "clerk"; the default `USER`-equivalent role). Every manager-only check passes for `ADMIN` **or** `MANAGER`. New signups get `CLERK`; the first user created gets `ADMIN`.

### API routes (all prefixed `/api`)
| Method | Path | Access |
| --- | --- | --- |
| GET | `/health`, `/health/deep` | public |
| GET | `/docs` | public (stack probe path) |
| POST | `/auth/signup`, `/auth/login` | public |
| GET | `/auth/me` | authed |
| POST | `/auth/logout` (204) | authed |
| GET | `/items?q=&lowStock=&page=` | authed |
| GET | `/items/:id` | authed |
| POST/PATCH/DELETE | `/items`, `/items/:id` | manager |
| GET | `/locations` | authed |
| POST/PATCH/DELETE | `/locations`, `/locations/:id` | manager |
| POST | `/movements` | authed |
| GET | `/movements?itemId=&type=&from=&to=&page=&pageSize=` | manager |
| GET | `/reports/low-stock` | manager |
| GET | `/admin/settings` | manager/admin |
| PATCH | `/admin/settings` | manager/admin |

### SPA routes (each carries `data.flow`, deep-linkable)
`''`→`/items`; `login` (`auth.login`, public); `signup` (`auth.signup`, public); `items` (`items.list`, authGuard, `?q&lowStock&page`); `items/new` (`items.create`, managerGuard); `items/:id` (`items.detail`, authGuard, `?tab=breakdown|movements`); `items/:id/edit` (`items.edit`, managerGuard); `locations` (`locations.list`, managerGuard); `locations/new` (`locations.create`); `locations/:id/edit` (`locations.edit`); `movements/new` (`movements.create`, authGuard, `?type&itemId&fromLocId`); `movements` (`movements.log`, managerGuard, `?itemId&type&from&to&page`); `admin/settings` (`admin.settings`, managerGuard); `**`→`/items`.

### Entities
`User(id, email @unique, passwordHash, role Role @default(CLERK), createdAt)`; `Item(id, sku @unique, name, description?, unit, reorderAt Int @default(0), createdAt, updatedAt)`; `Location(id, name @unique, zone, createdAt)`; `StockLevel(id, itemId, locationId, qty Int @default(0))` `@@unique([itemId, locationId])`; `Movement(id, type MovementType, itemId, fromLocId?, toLocId?, qty, note?, userId, createdAt)`; `SystemSetting(key String @id, value String, updatedAt DateTime @updatedAt)`.

### Error contract
`P2002` → 400 `<field> already exists` (duplicate SKU / email); `P2025` → 404; `P2003` → 409; over-draw → 400 `Insufficient stock` with the stored balance unchanged; unconfigured service → 503 `ServiceUnconfiguredError`.

### Smoke oracle
Unauthenticated load of `/` must redirect to `/login` and render the literal visible text **StockRoom** in an `<h1>`; the app shell exposes `data-testid="app-ready"`. The scaffold's `home` component and its `home-title">Users<` / `Loading...` / `Failed to load users.` markup must be gone.

## db_agent tasks
- [ ] In `backend/prisma/schema.prisma`, keep the existing datasource/generator blocks and add `enum Role { ADMIN MANAGER CLERK }` and `enum MovementType { IN OUT TRANSFER }`.
- [ ] Replace the scaffold `User` model with `User(id String @id @default(cuid()), email String @unique, passwordHash String, role Role @default(CLERK), createdAt DateTime @default(now()))` plus the `movements Movement[]` back-relation.
- [ ] Add `Item(id, sku String @unique, name, description String?, unit, reorderAt Int @default(0), createdAt, updatedAt @updatedAt)` with `stockLevels StockLevel[]` and `movements Movement[]`.
- [ ] Add `Location(id, name String @unique, zone String, createdAt)` with `stockLevels StockLevel[]` and the named back-relations `movementsFrom` / `movementsTo`.
- [ ] Add `StockLevel(id, itemId, locationId, qty Int @default(0))` with `@@unique([itemId, locationId])`, `@@index([itemId])`, and `onDelete: Cascade` from both `Item` and `Location`.
- [ ] Add `Movement(id, type MovementType, itemId, fromLocId String?, toLocId String?, qty Int, note String?, userId, createdAt @default(now()))` with named relations `fromLoc`/`toLoc` to `Location`, `onDelete: Restrict` on `item`, `fromLoc`, `toLoc`, `user`, and `@@index([itemId, createdAt])`, `@@index([createdAt])`.
- [ ] Add `SystemSetting(key String @id, value String, updatedAt DateTime @updatedAt)` for admin-managed credentials of the provisioned services (`postgresql`, `minio`).
- [ ] Generate the initial migration (`npx prisma migrate dev --name stockroom_init`) and run `npx prisma generate`; confirm `npx prisma migrate deploy` applies cleanly against an empty database.
- [ ] Rewrite `backend/prisma/seed/seed.js` to be idempotent (`upsert` only): consume `COLOSSUS_ACCOUNTS_JSON` when present (map platform role `USER` → `CLERK`), otherwise seed `manager@demo` / `Demo1234!` **first** (so it is user #1 = `ADMIN`-tier manager) then `clerk@demo` / `Demo1234!` as `CLERK`; bcrypt cost 10.
- [ ] Extend the seed with locations `Zone A|B|C` (`zone` = `A|B|C`), eight items `SKU-001`…`SKU-008` with varied `reorderAt` (e.g. `SKU-001 Hex Bolt M8`, unit `box`, `reorderAt 10`), `StockLevel` rows placing at least two items at/below `reorderAt` and at least one item in two locations, and matching historical `Movement` rows so the audit log and its filters are non-empty on first load.

## backend_agent tasks
- [ ] Delete the scaffold tRPC/users placeholders (`src/trpc/*`, `src/users/*`) and rewrite `src/app.module.ts` to wire `ConfigModule.forRoot({isGlobal:true})`, `PrismaModule`, `HealthModule`, `AuthModule`, `ItemsModule`, `LocationsModule`, `MovementsModule`, `ReportsModule`, `AdminSettingsModule`, and `APP_GUARD` providers for `JwtAuthGuard` then `RolesGuard`.
- [ ] Update `src/main.ts`: `app.setGlobalPrefix('api')`, global `ValidationPipe({whitelist:true, transform:true})`, global `PrismaExceptionFilter`, CORS from env, listen on `PORT`; keep `PrismaService` shutdown hooks.
- [ ] Serve a public `GET /api/docs` (Swagger/OpenAPI or a static route list) so the stack's `backend_probe_path` returns 200.
- [ ] Create `src/common/decorators/{public,roles,current-user}.decorator.ts` and `src/common/guards/{jwt-auth,roles}.guard.ts`: `JwtAuthGuard extends AuthGuard('jwt')` short-circuits on `IS_PUBLIC_KEY`, else 401; `RolesGuard` reads `@Roles(...)` and 403s, treating `ADMIN` as satisfying `MANAGER`.
- [ ] Create `src/common/filters/prisma-exception.filter.ts` mapping `P2002`→400 `<field> already exists`, `P2025`→404, `P2003`→409.
- [ ] Rewrite `src/health/health.controller.ts`: `@Public() GET /api/health` → `{status:'ok'}`; `@Public() GET /api/health/deep` runs `SELECT 1` and returns `{status, db}` or 503.
- [ ] Build `src/auth/` (module, controller, service, `jwt.strategy.ts`, `dto/{login,signup}.dto.ts`): HS256 JWT from `JWT_SECRET`, `JWT_EXPIRES_IN=24h`, payload `{sub,email,role}`, strategy re-loads the user (401 if deleted).
- [ ] Implement `AuthService.signup` (bcrypt cost 10; in a transaction `count()===0 ? ADMIN : CLERK`; duplicate email → 400) and `AuthService.login` (`bcrypt.compare`, else 401 `Invalid credentials`); controller exposes `@Public() POST /api/auth/signup`, `@Public() POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (204).
- [ ] Build `src/items/` (module/controller/service + `dto/{create-item,update-item,query-items}.dto.ts`): `POST` `@Roles(MANAGER)` with `sku @IsString @Length(1,64)`, `name`, `description?`, `unit`, `reorderAt @IsInt @Min(0)`; `GET /api/items?q=&lowStock=` for any authed user, `q` matching `sku`/`name` `contains, mode:'insensitive'`, each row mapped to `{...item, totalQty}`.
- [ ] Implement `GET /api/items/:id` returning the item plus `stockLevels: { include: { location: true } }` and `totalQty` (404 if absent), and `PATCH`/`DELETE /api/items/:id` `@Roles(MANAGER)` where delete returns 409 if any `Movement` references the item and otherwise cascades its `StockLevel` rows.
- [ ] Build `src/locations/` (module/controller/service + `dto/{create,update}-location.dto.ts`): `GET /api/locations` for any authed user; `POST`/`PATCH`/`DELETE` `@Roles(MANAGER)`; delete refused with 409 when any `StockLevel.qty > 0` or a `Movement` references the location.
- [ ] Implement `MovementsService.create(dto, user)` inside one `prisma.$transaction`: validate item + referenced locations (400 otherwise), `qty @IsInt @Min(1)`; `IN` requires `toLocId` and upserts with `qty: { increment }`; `OUT` requires `fromLocId` and uses the guarded `updateMany({ where:{ itemId, locationId: fromLocId, qty:{ gte: qty } }, data:{ qty:{ decrement: qty } } })` throwing `BadRequestException('Insufficient stock')` when `count === 0`; `TRANSFER` requires both, rejects `fromLocId === toLocId` (400), guarded-decrements the source then upsert-increments the destination; the `tx.movement.create` audit write shares the same transaction. Do not refactor into read-then-write.
- [ ] Expose `POST /api/movements` (any authed user) and `GET /api/movements` `@Roles(MANAGER)` with `itemId`, `type`, `from`/`to` (`@IsISO8601` → `createdAt: { gte, lte }`), `page`/`pageSize` (default 25), ordered `createdAt desc`, including `user{email,role}`, `item{sku,name}`, `fromLoc`, `toLoc`, and returning `{ rows, total, page, pageSize }`.
- [ ] Build `src/reports/`: `GET /api/reports/low-stock` `@Roles(MANAGER)` loads items with `stockLevels`, computes `totalQty = sum(qty)`, keeps rows where `totalQty <= reorderAt`, sorts by `totalQty - reorderAt` ascending, and returns `{ id, sku, name, unit, reorderAt, totalQty, deficit }`.
- [ ] Create `src/lib/config.ts` exporting `resolveConfig(key: string): Promise<string | null>` — reads `process.env[key]` first, falls back to the `SystemSetting` row when the env value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, returns `null` when neither is set — plus a `ServiceUnconfiguredError` that the exception filter maps to 503.
- [ ] Build the `(admin)` route group `src/admin/settings/`: `GET /api/admin/settings` lists the keys for the provisioned services `postgresql` (`DATABASE_URL`) and `minio` (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`) with masked values and a `configured` boolean per service; `PATCH /api/admin/settings` upserts key/value pairs. Both `@Roles(MANAGER)` (ADMIN satisfies).
- [ ] Update `backend/Dockerfile` + add `backend/docker-entrypoint.sh`: multi-stage `node:20-alpine`, `npm ci` → `npx prisma generate` → `npm run build`; runtime copies `dist/`, `node_modules/`, `prisma/`; entrypoint runs `npx prisma migrate deploy && npx prisma db seed` before `node dist/main.js`.
- [ ] Update root `docker-compose.yml` and add `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=24h`, `PORT`, MinIO keys): `db` = `postgres:16-alpine` with named volume + `pg_isready` healthcheck, `backend` `depends_on: db: {condition: service_healthy}` on port 3000, `frontend` 8080→80 `depends_on: backend`.

## ui_agent tasks
- [ ] Delete the scaffold `frontend/src/app/home/` component and every reference to it (removes the `home-title">Users<`, `Loading...`, `Failed to load users.` reject signatures); set `src/index.html` `<title>StockRoom</title>`.
- [ ] Rewrite `app.component.ts`: Material toolbar rendering the literal text **StockRoom**, `data-testid="app-ready"` on the shell root, nav links (Items, Movements, Locations, Log, Low stock, Admin settings) with manager-only entries hidden for clerks, current user email + Logout, and `<router-outlet/>`.
- [ ] Rewrite `app.routes.ts` with the full route table from the Surface contract — every route lazy-loads a standalone component and carries `data.flow`, `''` and `**` redirect to `/items`, guards applied as listed.
- [ ] Build `features/auth/login.component.ts`: centered Material card whose `<h1>` renders the literal visible text `StockRoom`, reactive email/password form, inline error on 400/401, link to signup, and a visible demo-credentials hint (`manager@demo` / `clerk@demo` / `Demo1234!`); on success navigate to the `redirect` query param or `/items`.
- [ ] Build `features/auth/signup.component.ts` mirroring login (same `<h1>StockRoom`), with a duplicate-email 400 shown against the email control and a link back to login.
- [ ] Build `features/items/item-list.component.ts`: Material table `sku, name, unit, reorderAt, totalQty`, search box + "Low stock only" toggle both bound bidirectionally to `?q`/`?lowStock`/`?page` via `queryParamMap` + `queryParamsHandling:'merge'`, row click → `/items/:id`, "New item" button only when `isManager()`, plus loading / empty / error states.
- [ ] Build `features/items/item-detail.component.ts`: header with sku/name/unit/reorderAt/totalQty; `?tab=breakdown` renders the per-location quantity table with a footer total equal to `totalQty`; `?tab=movements` (manager only) embeds the log filtered to this item; buttons "Record movement" → `/movements/new?itemId=`, Edit/Delete for managers with the 409 reason surfaced.
- [ ] Build `features/items/item-form.component.ts` — one reactive component for create and edit (`sku`, `name`, `description`, `unit`, `reorderAt`), surfacing the 400 duplicate-SKU message against the `sku` control.
- [ ] Build `features/locations/location-list.component.ts` (manager-only table of `name`/`zone` with create/edit/delete, showing the 409 reason when a location is in use) and `location-form.component.ts` (reactive create + edit).
- [ ] Build `features/movements/movement-form.component.ts`: `type` radio (IN/OUT/TRANSFER), item autocomplete, `fromLoc` (OUT/TRANSFER), `toLoc` (IN/TRANSFER), `qty` (min 1), `note`; controls enable/disable reactively on `type`; prefill from `?type&itemId&fromLocId`; hint showing current qty at the chosen source location; on 400 `Insufficient stock` show the error inline without clearing the form; on success navigate to item detail with a snackbar.
- [ ] Build `features/movements/movement-log.component.ts`: manager-only paginated table `createdAt, user.email, item.sku, type, qty, fromLoc, toLoc, note` with item select, type select and date-range pickers bound to `?itemId&type&from&to&page`.
- [ ] Build `features/reports/low-stock.component.ts`: table `sku, name, totalQty, reorderAt, deficit`, each row deep-linking to the item, with an explicit empty-state message when nothing is low.
- [ ] Build `features/admin/settings.component.ts` at `/admin/settings`: one section per provisioned service (`postgresql`, `minio`) with a configured/unconfigured badge and a per-service credential form (masked current values), saving via `PATCH /api/admin/settings`; render the banner "The following need credentials to activate: …" whenever the API reports any service as unconfigured.
- [ ] Add `shared/error-banner.component.ts` and a shared loading/empty-state pattern used by every list screen, plus `src/styles.scss` with the Angular Material theme; keep every component under the 400-line file budget.

## service_agent tasks
- [ ] Add `core/api-base.ts` exporting the `/api` base URL and a shared HTTP error normalizer that turns Nest error bodies into `{ status, message, field? }` for inline form errors.
- [ ] Add `shared/models.ts` with `User`, `Role`, `Item`, `ItemDetail`, `Location`, `StockLevel`, `Movement`, `MovementType`, `LowStockRow`, `SettingsService` and paginated-response types matching the API contract exactly.
- [ ] Add `core/auth.service.ts`: `user = signal<User|null>(null)`, `isManager = computed(...)` (true for `ADMIN` and `MANAGER`), `login`, `signup`, `logout` (clears `localStorage` token client-side), `restore()` calling `GET /api/auth/me` on bootstrap.
- [ ] Add `core/auth.interceptor.ts` attaching `Authorization: Bearer <token>` and, on 401, clearing the token and routing to `/login`; register it in `app.config.ts` via `provideHttpClient(withInterceptors([...]))` alongside `provideRouter(routes, withComponentInputBinding())` and `provideAnimationsAsync()`.
- [ ] Add `core/auth.guard.ts` (redirects to `/login?redirect=<url>`) and `core/manager.guard.ts` (redirects non-managers to `/items`).
- [ ] Add `features/items/items.service.ts` wrapping `GET /api/items` (with `q`/`lowStock`/`page`), `GET /api/items/:id`, `POST`, `PATCH`, `DELETE`.
- [ ] Add `features/locations/locations.service.ts` wrapping the four `/api/locations` endpoints.
- [ ] Add `features/movements/movements.service.ts` wrapping `POST /api/movements` and the filtered/paginated `GET /api/movements`, serialising `from`/`to` as ISO-8601.
- [ ] Add `features/reports/reports.service.ts` wrapping `GET /api/reports/low-stock`, and `features/admin/settings.service.ts` wrapping `GET`/`PATCH /api/admin/settings`.
- [ ] Ensure `frontend/nginx.conf` and `proxy.conf.json` both route `/api/` to the backend (`proxy_pass http://backend:3000;` plus `try_files $uri $uri/ /index.html`), and that the frontend Dockerfile copies `dist/stockroom/browser` guarded by `test -f dist/stockroom/browser/index.html`.

## tester tasks
- [ ] `test/auth.e2e-spec.ts` — unauthenticated calls to every data endpoint return 401; signup → login → `GET /api/auth/me` round-trip; the first seeded user is manager-tier and a fresh signup is `CLERK`; duplicate email → 400.
- [ ] `test/items.e2e-spec.ts` — clerk `POST /api/items` → 403; manager create → 201 and present in `GET /api/items`; duplicate `SKU-001` → 400 with the item count unchanged; `?q=` filters case-insensitively; 404 on unknown id.
- [ ] `test/locations.e2e-spec.ts` — manager creates a location and it appears in `GET /api/locations`; clerk can read but not write; delete of a location holding stock or referenced by a movement → 409.
- [ ] `test/movements.e2e-spec.ts` — IN 50 into Zone A → balance 50 plus a movement row naming the clerk, qty, type and timestamp; OUT 20 → 30; TRANSFER 10 → Zone A 20 / Zone B 10 with `totalQty` unchanged; `TRANSFER` with `fromLocId === toLocId` → 400.
- [ ] `test/movements-overdraw.e2e-spec.ts` — OUT 10 against 5 on hand → 400 `Insufficient stock` **and** a re-read confirming the stored balance is still 5 and no movement row was written.
- [ ] `test/movements-concurrency.e2e-spec.ts` — fire two simultaneous OUT movements each equal to the full balance; assert exactly one succeeds, the other 400s, and the balance never goes negative.
- [ ] `test/items-breakdown.e2e-spec.ts` — an item stocked in two locations returns a per-location breakdown whose quantities sum to `totalQty`.
- [ ] `test/reports.e2e-spec.ts` — `reorderAt` 10 with qty 12 then OUT 5 appears in `/api/reports/low-stock` with the correct `deficit`; `reorderAt` 10 with qty 40 is absent; clerk access → 403.
- [ ] `test/movements-log.e2e-spec.ts` — the audit log filtered by `itemId`, by `type`, and by `from`/`to` returns only matching rows in `createdAt desc` order with correct pagination totals; clerk access → 403.
- [ ] `test/admin-settings.e2e-spec.ts` — `GET /api/admin/settings` lists `postgresql` and `minio` keys with masked values and a `configured` flag, `PATCH` upserts them (clerk → 403), and `resolveConfig` prefers env over the DB row while treating `PLACEHOLDER_CONFIGURE_IN_SETTINGS` as unset.
- [ ] `test/health.e2e-spec.ts` — `/api/health` → 200 `{status:'ok'}` unauthenticated, `/api/health/deep` → 200 with `db:'ok'`, `/api/docs` → 200.
- [ ] `frontend/e2e/smoke.spec.ts` (Playwright) — load `/` unauthenticated, assert the redirect to `/login` and that visible body text contains **StockRoom**; log in as clerk, record an IN movement, assert the new balance on item detail; log in as manager and assert `/locations`, `/movements`, `/reports/low-stock` and `/admin/settings` render; assert a clerk session hitting those URLs is redirected to `/items`. Wait on Angular testability, not `networkidle`.
- [ ] Deploy check — `docker compose up --build`, then `GET /api/health/deep` → 200 and a browser load of `:8080` showing the login page with the `StockRoom` heading and `data-testid="app-ready"` present.

## Open questions
- **tRPC vs REST:** the scaffold ships a tRPC router (`backend/src/trpc`, `frontend/src/app/trpc-client.types.ts`) and `colossus.stack.json` declares `glue.api_client = "trpc"`, but the spec defines a plain REST surface under `/api`. These tasks follow the spec (REST) and delete the tRPC placeholders — confirm the stack tolerates the REST-only glue.
- **Role vocabulary:** the platform declares roles `ADMIN, MANAGER, USER` while the spec uses `MANAGER, CLERK`. Tasks assume `enum Role { ADMIN MANAGER CLERK }`, platform `USER` maps to `CLERK`, and `ADMIN` satisfies every `MANAGER` check. Confirm before the seed consumes `COLOSSUS_ACCOUNTS_JSON`.
- **Seed credentials:** the spec seeds `manager@demo` / `clerk@demo` with `Demo1234!`, but the stack requires the seed to consume platform-minted `COLOSSUS_ACCOUNTS_JSON`. Tasks do both (platform accounts when present, demo accounts otherwise) — confirm demo credentials are acceptable in provisioned environments.
- **MinIO:** `minio` is provisioned but the spec describes no file/object storage behaviour. Tasks only expose its credential keys through `/admin/settings`; no upload feature is invented. Confirm nothing else is expected of it.
- **Docker targets:** `colossus.stack.json` lists the frontend target as `web/Dockerfile.frontend`, but the scaffold on disk has `frontend/Dockerfile`. Tasks target `frontend/` — confirm which path the deploy step reads.
- **Angular dist name:** the frontend Dockerfile copy path assumes the Angular project is named `stockroom` (`dist/stockroom/browser`). Verify against `angular.json` before relying on the `test -f` guard.
- The spec does not define page sizes for `GET /api/items` or the low-stock report; only `/api/movements` specifies `pageSize` default 25.
