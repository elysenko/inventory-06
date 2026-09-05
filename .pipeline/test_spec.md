# Test Specification

> **WARNING — stale `surface.json`.** `.pipeline/surface.json` is the untouched Colossus scaffold artifact
> (`"_generated": true`). Its three routes (`GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`)
> and its five `testIds` (`home-main`, `home-title`, `users-loading`, `users-error`, `users-list`) describe the
> placeholder `home` component, **not** StockRoom. The authoritative API surface used below is the
> "Surface contract" in `.pipeline/tasks.md`, cross-checked against the spec. `requirements/spec.md` does not
> exist on disk; the spec text supplied to this agent was used directly.
> The two `/trpc/*` routes are covered as **removal assertions** (see *Out of scope*), and `GET /health` is
> covered in its real form, `GET /api/health` (the app sets a global `api` prefix).
>
> **Fixture note.** `frontend/angular.json` names the Angular project **`frontend`** with
> `outputPath: dist/frontend` — so the built artifacts land at `dist/frontend/browser`, **not**
> `dist/stockroom/browser` as the spec's Step 17 assumes. Case **D12** asserts the Dockerfile copy path and the
> `test -f` guard agree with `angular.json`; a test runner must not hardcode `dist/stockroom`.

## Coverage summary
- Total cases: 137 (108 API + 17 journeys + 12 data-integrity)
- API endpoints covered: 21 / 21 real endpoints (`tasks.md` surface contract); `surface.json` lists 3 stale scaffold routes, 1 of which (`GET /health`) maps to a real endpoint and 2 of which are asserted removed
- User journeys covered: 17

**Shared fixtures.** All API cases run against a database seeded by `prisma/seed/seed.js`:
users `manager@demo` / `Demo1234!` (user #1, manager/admin-tier) and `clerk@demo` / `Demo1234!` (`CLERK`);
locations `Zone A` (zone `A`), `Zone B` (`B`), `Zone C` (`C`); items `SKU-001` … `SKU-008`
(`SKU-001 Hex Bolt M8`, unit `box`, `reorderAt 10`). Tokens: `MGR` = manager JWT, `CLK` = clerk JWT,
`NONE` = no `Authorization` header, `BAD` = `Authorization: Bearer not-a-jwt`.
Tests that mutate balances must create their own item/location rather than mutating seeded rows another
test asserts on.

---

## API tests

### `GET /api/health`
- **Happy path**: `A1` — `NONE` → `200`, body exactly `{"status":"ok"}`. Public: no token required.
- **Validation failures**: n/a (no inputs).
- **Auth failures**: `A2` — `BAD` (malformed bearer token) → still `200`; `@Public()` short-circuits the guard, a bad token must not turn a public route into a `401`.
- **Idempotency / edge cases**: n/a.

### `GET /api/health/deep`
- **Happy path**: `A3` — `NONE` → `200`, body matches `{status:"ok", db:"ok"}`; the handler must have executed `SELECT 1` (assert `db` is present, not merely truthy).
- **Validation failures**: n/a.
- **Auth failures**: `A4` — `NONE` → not `401` (public route).
- **Idempotency / edge cases**: `A5` — with the database unreachable (stop `db`, or point `DATABASE_URL` at a dead port in an isolated app instance) → `503` with `db` ≠ `"ok"`; the process must not crash and `GET /api/health` must still return `200`.

### `GET /api/docs`
- **Happy path**: `A6` — `NONE` → `200` (stack `backend_probe_path`). Body is either the Swagger UI HTML or a JSON route list; assert `content-length > 0` and that the response mentions at least `/api/items` and `/api/movements`.
- **Validation failures**: n/a.
- **Auth failures**: `A7` — `NONE` → `200`, never `401`. This is the deploy probe; a guarded `/api/docs` fails the stack health check.
- **Idempotency / edge cases**: n/a.

### `POST /api/auth/signup`
- **Happy path**: `A8` — `NONE` + `{email:"new.clerk@example.com", password:"Demo1234!"}` → `201` (or `200`) with body containing an `access_token` (non-empty string, three dot-separated segments) and a user object `{id, email:"new.clerk@example.com", role:"CLERK"}`. **`passwordHash` must not appear anywhere in the body.**
- **Validation failures**:
  - `A9` — `{email:"not-an-email", password:"Demo1234!"}` → `400`, message references `email`.
  - `A10` — `{email:"a@b.com"}` (password missing) → `400`.
  - `A11` — `{email:"a@b.com", password:"Demo1234!", role:"MANAGER"}` → the extra `role` is stripped by `ValidationPipe({whitelist:true})`; created user is `CLERK`, **never** `MANAGER`. (Assert via `GET /api/auth/me` with the returned token.)
  - `A12` — `{email:"manager@demo", password:"Demo1234!"}` (duplicate) → `400` with message matching `/email already exists/i` (Prisma `P2002` mapping), and the total user count is unchanged.
- **Auth failures**: n/a (public).
- **Idempotency / edge cases**: `A13` — **first-user-is-admin.** Against a database seeded per the entrypoint, the seeded `manager@demo` is user #1 and is manager/admin-tier; a signup performed afterwards is `CLERK`. Additionally, against a *completely empty* database, the very first signup receives an admin-tier role and the second receives `CLERK`.

### `POST /api/auth/login`
- **Happy path**: `A14` — `{email:"manager@demo", password:"Demo1234!"}` → `200` with `access_token`; decoding the JWT payload yields `{sub, email:"manager@demo", role}` where `role` satisfies manager checks. `A15` — same for `clerk@demo` → `role:"CLERK"`.
- **Validation failures**: `A16` — `{}` → `400`; `A17` — `{email:"manager@demo", password:""}` → `400` (not `401`; DTO validation runs before credential comparison).
- **Auth failures**:
  - `A18` — `{email:"manager@demo", password:"WrongPass1!"}` → `401`, message exactly `Invalid credentials`; and `{email:"nobody@demo", password:"Demo1234!"}` → `401` with the **same** message and comparable latency (no user-enumeration oracle).
- **Idempotency / edge cases**: logging in twice returns two independently valid tokens; the first is not invalidated.

### `GET /api/auth/me`
- **Happy path**: `A19` — `CLK` → `200`, `{id, email:"clerk@demo", role:"CLERK"}`, no `passwordHash`.
- **Validation failures**: n/a.
- **Auth failures**: `A20` — `NONE` → `401`. `A21` — `BAD` → `401`. `A22` — a token signed with the correct secret for a user id that has since been deleted → `401` (the strategy re-loads the user); also a token signed with a **different** `JWT_SECRET` → `401`.
- **Idempotency / edge cases**: an expired token (`exp` in the past, correctly signed) → `401`.

### `POST /api/auth/logout`
- **Happy path**: `A23` — `CLK` → `204` with an empty body.
- **Auth failures**: `A24` — `NONE` → `401`.
- **Idempotency / edge cases**: **documented non-revocation** — after `A23`, re-using the same token on `GET /api/auth/me` still returns `200`. Logout is client-side only (no denylist); the test asserts the *current* contract so the behaviour change is caught if a denylist is later added.

### `GET /api/items`
- **Happy path**:
  - `A25` — `CLK` → `200`, an array (or `{rows,total,page,pageSize}` envelope — assert whichever the implementation returns, consistently) of ≥ 8 seeded items; each row has `{id, sku, name, unit, reorderAt, totalQty}` and `totalQty` is an integer.
  - `A26` — `totalQty` correctness: for `SKU-001`, `totalQty` equals the sum of that item's `StockLevel.qty` rows across all locations (cross-checked against `GET /api/items/:id`).
- **Validation failures**:
  - `A27` — `?q=hex%20bolt` (lowercase against seeded `Hex Bolt M8`) → returns `SKU-001`, proving `mode:'insensitive'`; `?q=SKU-00` returns multiple items (matches `sku` as well as `name`); `?q=zzzznomatch` → empty result, `200` not `404`.
  - `A28` — `?lowStock=true` → every returned row satisfies `totalQty <= reorderAt`, and at least the two seeded at/below-threshold items are present; `?lowStock=false` returns the full catalog.
  - `A29` — `?page=notanumber` → `400` (or is coerced by `transform:true` to a defined default — assert the endpoint never `500`s).
- **Auth failures**: `A30` — `NONE` → `401`.
- **Idempotency / edge cases**: `A31` — clerk and manager receive the same rows for the same query (this endpoint is not role-filtered); repeated identical GETs return identical bodies.

### `GET /api/items/:id`
- **Happy path**: `A32` — `CLK` + seeded `SKU-001` id → `200` with `{id, sku, name, description, unit, reorderAt, totalQty, stockLevels:[...]}` where each `stockLevels[]` entry includes a nested `location:{id,name,zone}`.
- **Validation failures**: `A33` — a well-formed but unknown cuid → `404`; a malformed id (`"abc"`) → `404` or `400`, never `500`.
- **Auth failures**: `A34` — `NONE` → `401`.
- **Idempotency / edge cases**: `A35` — **breakdown sums to total.** For the seeded item stocked in two locations, `stockLevels.length >= 2` and `sum(stockLevels[].qty) === totalQty` exactly.

### `POST /api/items`
- **Happy path**: `A36` — `MGR` + `{sku:"SKU-TEST-1", name:"Test Widget", description:"d", unit:"each", reorderAt:5}` → `201` with the created item echoed (`id` present, `reorderAt:5`); it then appears in `GET /api/items` and the item count increased by exactly 1.
- **Validation failures**:
  - `A37` — `{}` → `400` listing `sku`, `name`, `unit` as missing.
  - `A38` — `{sku:"", ...}` → `400` (`@Length(1,64)`); `sku` of 65 characters → `400`.
  - `A39` — `{..., reorderAt:-1}` → `400` (`@Min(0)`); `{..., reorderAt:"ten"}` → `400` (`@IsInt`); `{..., reorderAt:2.5}` → `400`.
  - `A40` — **duplicate SKU**: `MGR` + `{sku:"SKU-001", ...}` → `400` with message matching `/sku already exists/i`, **and** a follow-up `GET /api/items` shows the item count unchanged (no partial row written).
- **Auth failures**: `A41` — `CLK` → `403`; `NONE` → `401`. Assert `403` (authenticated, wrong role) is distinct from `401`.
- **Idempotency / edge cases**: `A42` — an unknown extra field (`{..., totalQty:999}`) is stripped by whitelist validation; the created item's `totalQty` is computed as `0`, not `999`.

### `PATCH /api/items/:id`
- **Happy path**: `A43` — `MGR` + `{name:"Renamed", reorderAt:12}` on `SKU-TEST-1` → `200` with the updated fields; a re-read via `GET /api/items/:id` reflects both; `sku` and `totalQty` are unchanged.
- **Validation failures**: `A44` — `{reorderAt:-3}` → `400`; `A45` — `{sku:"SKU-002"}` (a SKU that already belongs to another item) → `400` `/sku already exists/i` and neither item is modified.
- **Auth failures**: `A46` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**: `A47` — unknown id → `404` (`P2025` mapping); a `PATCH` with `{}` → `200` and no field changes (or `400` — assert whichever, consistently).

### `DELETE /api/items/:id`
- **Happy path**: `A48` — `MGR` deletes an item that has **no** movements → `200`/`204`; the item is absent from `GET /api/items` and `GET /api/items/:id` → `404`.
- **Validation failures**: `A49` — unknown id → `404`.
- **Auth failures**: `A50` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**:
  - `A51` — **audit-log protection**: deleting an item referenced by any `Movement` → `409`; the item is still readable afterwards and the movement rows are intact.
  - `A52` — **cascade**: deleting a movement-free item that has non-zero `StockLevel` rows removes those `StockLevel` rows (no orphans; verified via `D6`). A second `DELETE` of the same id → `404`.

### `GET /api/locations`
- **Happy path**: `A53` — `CLK` → `200` with the three seeded locations `Zone A/B/C`, each `{id, name, zone}`. Clerks **must** be able to read this (it populates the movement form).
- **Validation failures**: n/a.
- **Auth failures**: `A54` — `NONE` → `401`.
- **Idempotency / edge cases**: `A55` — manager sees the identical set.

### `POST /api/locations`
- **Happy path**: `A56` — `MGR` + `{name:"Zone D", zone:"D"}` → `201`; appears in a subsequent `GET /api/locations`.
- **Validation failures**: `A57` — `{}` → `400`; `{name:"", zone:"D"}` → `400`; `A58` — `{name:"Zone A", zone:"A"}` (duplicate name) → `400` `/name already exists/i`, location count unchanged.
- **Auth failures**: `A59` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**: `A60` — a newly created location starts with no `StockLevel` rows, and an item's `totalQty` is unaffected by its creation.

### `PATCH /api/locations/:id`
- **Happy path**: `A61` — `MGR` + `{zone:"E"}` on `Zone D` → `200`; re-read reflects it; `name` unchanged.
- **Validation failures**: `A62` — renaming to an existing name → `400`; unknown id → `404`.
- **Auth failures**: `A63` — `CLK` → `403`; `NONE` → `401`.

### `DELETE /api/locations/:id`
- **Happy path**: `A64` — `MGR` deletes an empty, never-referenced location (`Zone D`) → `200`/`204`; absent from `GET /api/locations`.
- **Validation failures**: `A65` — unknown id → `404`.
- **Auth failures**: `A66` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**:
  - `A67` — deleting a location holding stock (`StockLevel.qty > 0`) → `409`; the location and its stock survive.
  - `A68` — deleting a location referenced by a `Movement` as `fromLoc` **or** `toLoc`, even after its stock has been drained to `0` → `409` (audit log preserved). Both directions must be tested.

### `POST /api/movements`
Baseline for this block: a fresh item `SKU-MOVE` (`reorderAt 10`) with zero stock everywhere.
- **Happy path**:
  - `A69` — **IN**: `CLK` + `{type:"IN", itemId, toLocId:<Zone A>, qty:50, note:"receipt"}` → `201`. Re-read `GET /api/items/:id` → `Zone A` qty `50`, `totalQty 50`. Exactly one new `Movement` row exists, and (read via `GET /api/movements` as `MGR`) it carries `user.email === "clerk@demo"`, `qty 50`, `type "IN"`, `item.sku "SKU-MOVE"`, `toLoc.name "Zone A"`, `fromLoc === null`, and a `createdAt` within 60s of now.
  - `A70` — **OUT**: then `{type:"OUT", itemId, fromLocId:<Zone A>, qty:20}` → `201`; `Zone A` qty `30`, `totalQty 30`.
  - `A71` — **TRANSFER**: then `{type:"TRANSFER", itemId, fromLocId:<Zone A>, toLocId:<Zone B>, qty:10}` → `201`; `Zone A` `20`, `Zone B` `10`, **`totalQty` still `30`** (conservation).
  - `A72` — `IN` into a location with no existing `StockLevel` row creates one via upsert (no `P2025`).
- **Validation failures**:
  - `A73` — `{type:"IN", itemId, qty:5}` (no `toLocId`) → `400`.
  - `A74` — `{type:"OUT", itemId, qty:5}` (no `fromLocId`) → `400`.
  - `A75` — `{type:"TRANSFER", itemId, fromLocId:X, qty:5}` (no `toLocId`) → `400`.
  - `A76` — `{type:"TRANSFER", itemId, fromLocId:X, toLocId:X, qty:5}` (same location) → `400`.
  - `A77` — `qty:0` → `400`; `qty:-5` → `400`; `qty:1.5` → `400`; `qty:"5"` as a raw string in JSON → `400` or coerced by `transform` (assert never `500`, never a fractional balance).
  - `A78` — `{type:"SHRINKAGE", ...}` (invalid enum) → `400`.
  - `A79` — unknown `itemId` → `400`; unknown `toLocId` / `fromLocId` → `400`. In every case **no** `Movement` row is written.
- **Auth failures**: `A80` — `NONE` → `401`. `A81` — `CLK` → `201`; recording movements is explicitly **allowed** for clerks (a `403` here is a bug).
- **Idempotency / edge cases**:
  - `A82` — **over-draw**: with `5` on hand at `Zone C`, `{type:"OUT", fromLocId:<Zone C>, qty:10}` → `400` message `Insufficient stock`; **a re-read confirms the stored balance is still exactly `5`** and **no** `Movement` row was appended (count unchanged). The failing `OUT` must leave nothing behind.
  - `A83` — over-draw via `TRANSFER` (source has `5`, transfer `10`) → `400` `Insufficient stock`; **both** source and destination balances unchanged, no `Movement` row.
  - `A84` — **concurrency**: with exactly `N` on hand at one location, fire two simultaneous `OUT` requests of `qty:N` each (issued without awaiting the first). Assert exactly one returns `201` and one returns `400 Insufficient stock`; the resulting balance is exactly `0` and **never negative**; exactly one `Movement` row was written. Repeat the race ≥ 5 times to catch a read-then-write regression. `OUT` at `qty === balance` (exact drain) must succeed — the guard is `gte`, not `gt`.

### `GET /api/movements`
- **Happy path**: `A85` — `MGR` → `200` with `{rows, total, page, pageSize}`; `pageSize` defaults to `25`; `rows` is non-empty on a seeded database; each row includes `user{email,role}`, `item{sku,name}`, `fromLoc`, `toLoc`, `type`, `qty`, `note`, `createdAt`.
- **Validation failures**:
  - `A86` — `?itemId=<SKU-001 id>` → every returned row has `item.sku === "SKU-001"`, and the count equals the number of movements for that item.
  - `A87` — `?type=IN` → every row has `type === "IN"`; `?type=BOGUS` → `400`.
  - `A88` — `?from=<ISO ts>&to=<ISO ts>` → every row's `createdAt` is within `[from, to]` inclusive; a window strictly before every seeded movement returns `total: 0` with `200`; `?from=yesterday` (non-ISO) → `400` (`@IsISO8601`).
  - `A89` — combined `?itemId=&type=&from=&to=` narrows conjunctively (AND, not OR).
  - `A90` — `?page=2&pageSize=1` returns a different single row than `?page=1&pageSize=1`, with the same `total`; `?page=0` or `?pageSize=-1` → `400` or a clamped default, never `500`.
- **Auth failures**: `A91` — `CLK` → `403` (manager-only); `NONE` → `401`.
- **Idempotency / edge cases**:
  - `A92` — ordering is `createdAt` **descending**: `rows[i].createdAt >= rows[i+1].createdAt` for all `i`, across page boundaries too.
  - `A93` — the row for the `A69` `IN` movement shows `fromLoc === null`; the row for an `OUT` shows `toLoc === null`.
  - `A94` — `total` reflects the *filtered* count, not the table count.

### `GET /api/reports/low-stock`
- **Happy path**: `A95` — `MGR` → `200`, an array of `{id, sku, name, unit, reorderAt, totalQty, deficit}`; non-empty against the seeded database (the seed guarantees ≥ 2 at/below-threshold items).
- **Validation failures**: n/a (no inputs).
- **Auth failures**: `A96` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**:
  - `A97` — **inclusion**: an item with `reorderAt 10` and `12` on hand is **absent**; after an `OUT` of `5` (→ `7`) it is **present** with `totalQty 7`, `deficit` = `reorderAt - totalQty` = `3` (assert the sign convention the implementation returns and keep it consistent with the UI column).
  - `A98` — **exclusion**: an item with `reorderAt 10` and `40` on hand is absent.
  - `A99` — **boundary + ordering**: an item at exactly `totalQty === reorderAt` **is** included (predicate is `<=`); an item with `reorderAt 0` and `0` on hand is included; rows are sorted by `totalQty - reorderAt` ascending (worst deficit first). An item with zero `StockLevel` rows at all is treated as `totalQty 0`, not skipped.

### `GET /api/admin/settings`
- **Happy path**: `A100` — `MGR` → `200` listing both provisioned services, `postgresql` (key `DATABASE_URL`) and `minio` (keys `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`), each with a `configured` boolean.
- **Validation failures**: n/a.
- **Auth failures**: `A101` — `CLK` → `403`; `NONE` → `401`. An `ADMIN`-role token satisfies the `MANAGER` requirement → `200`.
- **Idempotency / edge cases**:
  - `A102` — **masking**: no response field contains a full secret. A key whose stored value is `supersecretvalue` renders masked (e.g. `****alue` / `••••`); assert the raw value string is **not** a substring of the serialized body.
  - `A103` — a key set to the literal `PLACEHOLDER_CONFIGURE_IN_SETTINGS` reports `configured: false`; a key set to a real value reports `configured: true`; a key unset in both env and `SystemSetting` reports `configured: false`.

### `PATCH /api/admin/settings`
- **Happy path**: `A104` — `MGR` + `{"MINIO_BUCKET":"stockroom-files"}` → `200`; a follow-up `GET` shows `minio`'s `MINIO_BUCKET` present and (once all its keys are set) `configured: true`. Re-`PATCH`ing the same key updates rather than duplicating (`SystemSetting.key` is the primary key → upsert).
- **Validation failures**: `A105` — a non-object body or a non-string value → `400`; an empty object → `200` no-op (or `400`; assert consistently).
- **Auth failures**: `A106` — `CLK` → `403`; `NONE` → `401`.
- **Idempotency / edge cases**:
  - `A107` — **`resolveConfig` precedence** (unit test on `src/lib/config.ts`): with `process.env.K = "fromEnv"` and a `SystemSetting` row `K = "fromDb"`, `resolveConfig("K")` → `"fromEnv"`; with `process.env.K = "PLACEHOLDER_CONFIGURE_IN_SETTINGS"` → `"fromDb"`; with neither set → `null`; with env unset and a DB row → `"fromDb"`.
  - `A108` — a handler that requires an unconfigured service throws `ServiceUnconfiguredError`, which the exception filter maps to `503` (not `500`).

---

## UI / journey tests

Playwright, against the composed stack at `:8080`. **Wait strategy: Angular testability**
(`getAllAngularTestabilities().every(t => t.isStable())`) — `networkidle` never fires for this SPA
(per `colossus.stack.json`). Login helper: navigate to `/login`, fill email + password, submit, wait for
the URL to leave `/login`.

### Journey: Unauthenticated root redirect (SMOKE_MARKER — highest value)
- **Steps**: With `localStorage` cleared, navigate to `/`.
- **Expected outcomes**: URL settles on `/login` (query string may include `redirect=`). **Visible body text contains the literal `StockRoom`**, and it is rendered by an `<h1>` on the login page — not only in `<title>` or a hidden/authenticated-only toolbar. `document.title` is `StockRoom`. An element with `data-testid="app-ready"` is present. The reject signatures `home-title">Users<`, `Loading...`, and `Failed to load users.` are **absent** from the page source.
- **Negative path**: Navigating to a garbage deep link (`/nonexistent/route`) while unauthenticated also lands on `/login` (via the `**` → `/items` → `authGuard` chain), still showing `StockRoom`.

### Journey: Signup a new clerk
- **Steps**: `/signup` → fill a unique email + `Demo1234!` → submit.
- **Expected outcomes**: Redirected to `/items`; the toolbar shows the new email; the item table renders. The new account has clerk privileges (no "New item" button, see role gating below).
- **Negative path**: Re-submitting with `manager@demo` shows the `400` duplicate-email message **inline against the email control**, the user stays on `/signup`, and the password field is not silently cleared into a confusing state.

### Journey: Login as clerk
- **Steps**: `/login` → `clerk@demo` / `Demo1234!` → submit.
- **Expected outcomes**: Navigates to `/items`; token stored in `localStorage`; toolbar shows `clerk@demo` and a Logout control. The visible demo-credentials hint (`manager@demo`, `clerk@demo`, `Demo1234!`) is present on the login page.
- **Negative path**: `clerk@demo` / `WrongPass1!` → inline error text matching `/invalid credentials/i`, URL stays `/login`, no token written to `localStorage`.

### Journey: Browse and search the item catalog
- **Steps**: As clerk on `/items`, type `hex` into the search box; then toggle "Low stock only"; then reload the page.
- **Expected outcomes**: The table shows columns `sku, name, unit, reorderAt, totalQty`. Typing `hex` narrows the rows to `SKU-001` **and** pushes `?q=hex` into the URL. Toggling adds `?lowStock=true`, merging with `q` rather than replacing it. **After a full page reload the filters are restored from the URL** and the same rows render (deep-link restorability).
- **Negative path**: `?q=zzzznomatch` renders an explicit empty-state message, not a spinner that never resolves and not an error banner.

### Journey: Item detail and per-location breakdown
- **Steps**: Click a row for the seeded item stocked in two locations → lands on `/items/:id` → ensure `?tab=breakdown`.
- **Expected outcomes**: Header shows sku, name, unit, `reorderAt`, `totalQty`. The breakdown table lists one row per location with a quantity, and **the footer total equals the header `totalQty`** (assert numerically, by summing the rendered per-location cells). A "Record movement" button links to `/movements/new?itemId=<id>`.
- **Negative path**: `/items/<unknown-id>` renders a not-found / error state, not a blank page or an infinite spinner.

### Journey: Clerk records an IN movement
- **Steps**: As clerk, `/movements/new?itemId=<id>` → select type `IN` → confirm the item is prefilled from the query param → choose `Zone A` as destination → `qty 50` → note `receipt` → submit.
- **Expected outcomes**: A snackbar confirms; navigation lands on the item detail; **the displayed balance for `Zone A` increased by exactly 50 and `totalQty` increased by 50**. With type `IN` selected, the `fromLoc` control is hidden/disabled and `toLoc` is shown.
- **Negative path**: Submitting with `qty` empty or `0` blocks submission with a client-side validation message and issues no HTTP request.

### Journey: Clerk records OUT and TRANSFER
- **Steps**: On the same item: record `OUT 20` from `Zone A`; then `TRANSFER 10` from `Zone A` to `Zone B`.
- **Expected outcomes**: After `OUT`, `Zone A` shows `30`. After `TRANSFER`, `Zone A` shows `20`, `Zone B` shows `10`, and `totalQty` is unchanged at `30`. Selecting `TRANSFER` reveals **both** `fromLoc` and `toLoc`; selecting `OUT` reveals only `fromLoc`. The form shows a hint with the item's current qty at the chosen source location.
- **Negative path**: Selecting the same location for `fromLoc` and `toLoc` on a `TRANSFER` is rejected (client-side, or via the server `400` shown inline) and no balance changes.

### Journey: Over-draw is refused without losing the form
- **Steps**: As clerk, attempt `OUT` of a qty greater than the on-hand balance at the selected location.
- **Expected outcomes**: The server's `400` message `Insufficient stock` is surfaced **inline**, the form retains every entered value (type, item, location, qty, note) so the user can correct just the quantity, and navigating to the item detail confirms the balance is **unchanged**.
- **Negative path**: The error does not appear as an unhandled console exception, a full-page crash, or a redirect to `/login`.

### Journey: Manager creates, edits and deletes an item
- **Steps**: As manager, `/items` → "New item" → fill `sku/name/unit/reorderAt` → save. Then open the item → Edit → change the name → save. Then Delete it.
- **Expected outcomes**: The "New item" button is visible for the manager (it is hidden for clerks). After create, the new row appears in the list. After edit, the detail header shows the new name. After delete, the item is gone from `/items`.
- **Negative path**: Creating with the existing `SKU-001` surfaces the `400` duplicate message **against the `sku` control specifically**, the form stays open with its values, and no row is added. Deleting an item that has movements surfaces the `409` reason text and the item remains listed.

### Journey: Manager administers locations
- **Steps**: As manager, `/locations` → create `Zone D` / zone `D` → edit its zone → attempt to delete `Zone A` (which holds stock) → delete `Zone D`.
- **Expected outcomes**: The table lists `name` and `zone`. Create and edit are reflected immediately in the table.
- **Negative path**: Deleting `Zone A` shows the `409` in-use reason as visible text and `Zone A` remains in the table. Creating a duplicate `Zone A` shows the `400` name-already-exists message inline.

### Journey: Manager filters the movement audit log
- **Steps**: As manager, `/movements` → select a specific item in the item filter → select type `IN` → set a date range → page forward → reload the page.
- **Expected outcomes**: Columns `createdAt, user.email, item.sku, type, qty, fromLoc, toLoc, note` render, newest first. Each filter writes to the URL (`?itemId&type&from&to&page`), and after a reload the filters and the page are restored from the URL. Filtered rows all match the criteria; the paginator's total reflects the filtered count. A row created by the clerk shows `clerk@demo`.
- **Negative path**: A date range matching nothing renders an empty-state message with the filters still populated (not a reset form and not an error banner).

### Journey: Manager reads the low-stock report
- **Steps**: As manager, `/reports/low-stock`; click a row.
- **Expected outcomes**: Table `sku, name, totalQty, reorderAt, deficit`; non-empty on a freshly seeded stack; every row satisfies `totalQty <= reorderAt`; clicking a row deep-links to that item's detail page.
- **Negative path**: When no item is low (achievable by stocking every item above its `reorderAt` in a dedicated fixture), an explicit empty-state message is shown — not an empty table with headers only.

### Journey: Manager configures admin settings
- **Steps**: As manager, `/admin/settings` → inspect the `postgresql` and `minio` sections → fill the `minio` credential fields → save.
- **Expected outcomes**: One section per provisioned service, each with a configured/unconfigured badge and masked current values. Saving issues `PATCH /api/admin/settings`; after a reload the values persist (still masked) and the badge flips to configured. While any service is unconfigured, the banner "The following need credentials to activate: …" is rendered and names that service.
- **Negative path**: A save failure surfaces an error banner and does not wipe the form. No full secret value is ever rendered in the DOM.

### Journey: Role gating — clerk is redirected from manager routes
- **Steps**: Logged in as clerk, navigate directly to `/locations`, `/locations/new`, `/items/new`, `/movements`, `/reports/low-stock`, `/admin/settings`.
- **Expected outcomes**: **Every one** redirects to `/items`; none renders manager content even briefly (assert on the settled URL and on the absence of the manager view's distinguishing heading). The toolbar hides Locations, Log, Low stock and Admin settings for clerks and shows them for managers.
- **Negative path**: The clerk's own permitted routes (`/items`, `/items/:id`, `/movements/new`) still render normally after these redirects — the guard must not corrupt session state.

### Journey: Auth guard, redirect-back, and 401 handling
- **Steps**: With `localStorage` cleared, navigate directly to `/items/<id>`; log in from the resulting page. Separately: while logged in, corrupt the stored token and trigger any API call.
- **Expected outcomes**: The guard redirects to `/login?redirect=/items/<id>`, and after a successful login the app navigates **back to `/items/<id>`**, not to `/items`. On a `401` from any API call, the interceptor clears the token and routes to `/login`.
- **Negative path**: The `401`-triggered redirect does not loop (assert the URL settles and the login form is interactive).

### Journey: Logout
- **Steps**: Logged in as manager, click Logout; then navigate to `/items`.
- **Expected outcomes**: The token is removed from `localStorage`, the app lands on `/login` showing `StockRoom`, and `/items` redirects back to `/login`. The toolbar no longer shows the user email.
- **Negative path**: Pressing browser Back after logout does not render an authenticated view from cache — the guard re-evaluates and redirects to `/login`.

### Journey: Deployed stack smoke (docker compose)
- **Steps**: `docker compose up --build`; wait for the backend to be healthy; `GET http://localhost:3000/api/health/deep` (and `/api/docs`); load `http://localhost:8080/` in a browser; then load `http://localhost:8080/items` directly (SPA deep link through nginx).
- **Expected outcomes**: `/api/health/deep` → `200` with `db:"ok"`; `/api/docs` → `200`; the browser shows the login page with the `StockRoom` `<h1>` and `data-testid="app-ready"`; the direct `/items` deep link serves `index.html` via the `try_files` fallback (not an nginx `404`); `/api/*` from the SPA origin proxies to the backend (same-origin, no CORS error in the console).
- **Negative path**: A blank page or an nginx `404` at `:8080` fails the check — most likely the Angular `dist` copy path (see `D12`).

---

## Data integrity tests

Assertions made directly against Postgres (or via a read-back API call) after mutations.

- `D1` — **Conservation under TRANSFER.** After any `TRANSFER` of `q` from `L1` to `L2` for item `I`,
  `SUM(qty)` over all of `I`'s `StockLevel` rows is identical to its value before the transfer.
  `IN` increases the sum by exactly `q`; `OUT` decreases it by exactly `q`.
- `D2` — **No negative balances, ever.** `SELECT COUNT(*) FROM "StockLevel" WHERE qty < 0` is `0` after the
  entire suite, including after the concurrency race (`A84`) and every rejected over-draw.
- `D3` — **Balance write and audit write are atomic.** After a rejected movement (over-draw, unknown item,
  same-location transfer, validation failure), the `Movement` count is unchanged **and** every `StockLevel`
  is unchanged. After a successful movement, exactly one `Movement` row exists for it and the balances moved.
  Neither half may land alone.
- `D4` — **Audit rows are attributed.** Every `Movement` row has a non-null `userId` resolving to a real user,
  a non-null `createdAt`, and location fields consistent with its type: `IN` → `fromLocId IS NULL AND toLocId
  IS NOT NULL`; `OUT` → `toLocId IS NULL AND fromLocId IS NOT NULL`; `TRANSFER` → both non-null and distinct.
- `D5` — **Uniqueness.** `@@unique([itemId, locationId])` on `StockLevel` holds — no duplicate pair exists even
  after repeated `IN` upserts into the same cell. `User.email`, `Item.sku` and `Location.name` are unique.
- `D6` — **Referential integrity.** No `StockLevel` references a deleted `Item` or `Location` (item delete
  cascades its stock rows); no `Movement` references a deleted `Item`, `Location` or `User`
  (`onDelete: Restrict` holds — the deletes are refused with `409` instead).
- `D7` — **`totalQty` is derived, never stored.** There is no persisted `totalQty` column; the API-reported
  `totalQty` for every item equals `COALESCE(SUM(StockLevel.qty), 0)` for that item at all times.
- `D8` — **Password hashing.** No `User.passwordHash` equals a plaintext password; every hash matches the
  bcrypt format (`$2[aby]$10$…`, cost 10) and `bcrypt.compare("Demo1234!", hash)` is true for the seeded users.
  No API response body anywhere in the suite contains the substring `passwordHash` or a `$2` hash prefix.
- `D9` — **First-user-is-admin ordering.** After the seed, the user with the smallest `createdAt` is
  `manager@demo` and is manager/admin-tier; every user created by a later signup is `CLERK`.
- `D10` — **Seed idempotency.** Running the seed twice in a row (simulating a container restart) leaves the
  user, item and location counts unchanged, produces no unique-constraint error, and does not duplicate the
  historical `Movement` rows. After the second run the low-stock report and the audit log are still non-empty.
- `D11` — **Low-stock fixtures survive seeding.** At least two seeded items satisfy `totalQty <= reorderAt`
  and at least one seeded item has `StockLevel` rows in two distinct locations — the fixtures `A35`, `A95`
  and the breakdown journey depend on this.
- `D12` — **Build-path integrity.** The Angular project name in `frontend/angular.json` (currently
  `frontend`, `outputPath: dist/frontend`) matches the `COPY --from=build .../browser` path in the frontend
  Dockerfile, and the build stage's `test -f <outputPath>/browser/index.html` guard references that same path.
  A mismatch must fail the image build, not ship a blank page.

---

## Out of scope

- **`GET /trpc/users.findAll` and `GET /trpc/users.findById`** (listed in the stale `surface.json`). These are
  scaffold placeholders that `tasks.md` explicitly deletes. Not tested as functional endpoints; instead a
  single **removal assertion** is made: `backend/src/trpc/` and `backend/src/users/` are gone,
  `frontend/src/app/trpc-client.types.ts` is gone, and requests to `/trpc/*` return `404`.
  (`colossus.stack.json` declares `glue.api_client = "trpc"` while the spec defines REST — an unresolved
  open question in `tasks.md`; this spec follows the product spec.)
- **Scaffold `testIds`** `home-main`, `home-title`, `users-loading`, `users-error`, `users-list`. Asserted
  **absent** (they are the acceptance file's reject signatures), never asserted present.
- **JWT revocation on logout.** The spec states there is no denylist; a token stays valid for its full 24h
  after logout. Covered descriptively by `A24`'s edge case as the *current* contract, not as a security
  requirement.
- **Password strength / complexity policy, rate limiting, account lockout, password reset, email
  verification, refresh tokens.** The spec defines none of these.
- **MinIO object storage behaviour** (uploads, buckets, presigned URLs). MinIO is provisioned but the spec
  describes no file feature; only its credential keys are surfaced through `/admin/settings` (`A100`–`A104`).
- **Multi-tenancy, per-location authorization, and row-level ownership.** Every authenticated user sees the
  whole catalog and every location; the spec's only access axis is clerk vs. manager.
- **Concurrency beyond the same-cell `OUT` race** (`A84`) — e.g. concurrent `TRANSFER` chains, deadlock
  ordering across many items, or sustained load. The spec calls out exactly one race.
- **Page-size contracts for `GET /api/items` and `/api/reports/low-stock`.** The spec defines a default
  `pageSize` only for `/api/movements` (25); item and report pagination limits are therefore asserted only as
  "does not error", not against a specific number.
- **Localization, timezone rendering, accessibility (WCAG), responsive/mobile layout, browser-matrix
  compatibility, and visual regression.** The spec is silent on all of them.
- **`COLOSSUS_ACCOUNTS_JSON` platform-account seeding path.** Tested only in its fallback form (demo
  credentials), since the platform variable is absent in the local test environment; the role mapping
  `USER → CLERK` is an unconfirmed open question in `tasks.md`.
- **Exact HTTP status for successful `DELETE` (`200` vs `204`) and for `POST /api/items` (`200` vs `201`).**
  Tests accept either but require the choice to be consistent across the suite.
