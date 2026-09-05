import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Role } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

/**
 * End-to-end coverage of the spec's Requirements against a real database.
 *
 * The suite skips itself when DATABASE_URL is unset, so `npm test` stays green
 * in an environment without Postgres; CI and the deploy pipeline both provide
 * one, and there the full behaviour is exercised.
 *
 * Every row it creates is namespaced by a per-run stamp and removed in
 * afterAll, so it is safe to run repeatedly against a shared database.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('StockRoom API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => request.Agent;

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const managerEmail = `e2e.manager.${stamp}@test.local`;
  const clerkEmail = `e2e.clerk.${stamp}@test.local`;
  const password = 'E2ePassw0rd!';
  const sku = `E2E-${stamp}`;

  let managerToken = '';
  let clerkToken = '';
  let itemId = '';
  let zoneA = '';
  let zoneB = '';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'stockroom-e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    http = () => request(app.getHttpServer());

    // Two principals: a stock clerk (self-service signup) and a manager.
    const clerk = await http()
      .post('/api/auth/signup')
      .send({ email: clerkEmail, password, name: 'E2E Clerk' })
      .expect(201);
    clerkToken = clerk.body.token;

    const manager = await http()
      .post('/api/auth/signup')
      .send({ email: managerEmail, password, name: 'E2E Manager' })
      .expect(201);
    await prisma.user.update({
      where: { id: manager.body.user.id },
      data: { role: Role.MANAGER },
    });
    const relogin = await http()
      .post('/api/auth/login')
      .send({ email: managerEmail, password })
      .expect(200);
    managerToken = relogin.body.token;
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    if (itemId) {
      await prisma.movement.deleteMany({ where: { itemId } });
      await prisma.stockLevel.deleteMany({ where: { itemId } });
      await prisma.item.deleteMany({ where: { id: itemId } });
    }
    const locationIds = [zoneA, zoneB].filter(Boolean);
    if (locationIds.length) {
      await prisma.stockLevel.deleteMany({
        where: { locationId: { in: locationIds } },
      });
      await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [managerEmail, clerkEmail] } },
    });
    await app.close();
  }, 60_000);

  // ── Requirement: authentication and role gating ──────────────────────────
  describe('auth', () => {
    it.each(['/api/items', '/api/locations', '/api/movements', '/api/reports/low-stock'])(
      'rejects an unauthenticated GET %s with 401',
      async (path) => {
        await http().get(path).expect(401);
      },
    );

    it('rejects a wrong password with 401 and the same message as an unknown account', async () => {
      const wrong = await http()
        .post('/api/auth/login')
        .send({ email: managerEmail, password: 'NotThePassword1!' })
        .expect(401);
      const unknown = await http()
        .post('/api/auth/login')
        .send({ email: `nobody.${stamp}@test.local`, password })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('creates self-service signups as a stock clerk, not a manager', async () => {
      const me = await http()
        .get('/api/auth/me')
        .set(auth(clerkToken))
        .expect(200);
      expect(me.body.role).toBe(Role.USER);
      expect(me.body.passwordHash).toBeUndefined();
    });
  });

  // ── Requirement: only managers may change the catalogue ──────────────────
  describe('catalogue', () => {
    it('refuses a clerk creating an item with 403', async () => {
      await http()
        .post('/api/items')
        .set(auth(clerkToken))
        .send({ sku, name: 'Blocked', unit: 'box', reorderAt: 1 })
        .expect(403);
    });

    it('lets a manager create an item, which then appears in the catalogue', async () => {
      const created = await http()
        .post('/api/items')
        .set(auth(managerToken))
        .send({ sku, name: 'Hex Bolt M8', unit: 'box', reorderAt: 10 })
        .expect(201);
      itemId = created.body.id;
      expect(created.body.totalQty).toBe(0);

      const list = await http()
        .get(`/api/items?q=${sku}`)
        .set(auth(clerkToken))
        .expect(200);
      expect(list.body.map((i: { sku: string }) => i.sku)).toContain(sku);
    });

    it('refuses a duplicate SKU with 400 and leaves the catalogue unchanged', async () => {
      const before = await prisma.item.count();
      const res = await http()
        .post('/api/items')
        .set(auth(managerToken))
        .send({ sku, name: 'Duplicate', unit: 'box', reorderAt: 1 })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/sku already exists/i);
      expect(await prisma.item.count()).toBe(before);
    });

    it('lets a manager create locations that a clerk can then read', async () => {
      const a = await http()
        .post('/api/locations')
        .set(auth(managerToken))
        .send({ name: `E2E Zone A ${stamp}`, zone: 'A' })
        .expect(201);
      const b = await http()
        .post('/api/locations')
        .set(auth(managerToken))
        .send({ name: `E2E Zone B ${stamp}`, zone: 'B' })
        .expect(201);
      zoneA = a.body.id;
      zoneB = b.body.id;

      const list = await http()
        .get('/api/locations')
        .set(auth(clerkToken))
        .expect(200);
      expect(list.body.map((l: { id: string }) => l.id)).toEqual(
        expect.arrayContaining([zoneA, zoneB]),
      );

      await http()
        .post('/api/locations')
        .set(auth(clerkToken))
        .send({ name: `Blocked ${stamp}`, zone: 'Z' })
        .expect(403);
    });
  });

  // ── Requirement: movements mutate balances atomically ────────────────────
  describe('movements', () => {
    const detail = async () =>
      (await http().get(`/api/items/${itemId}`).set(auth(clerkToken)).expect(200))
        .body;
    const qtyAt = (body: { stockLevels: { locationId: string; qty: number }[] }, loc: string) =>
      body.stockLevels.find((s) => s.locationId === loc)?.qty ?? 0;

    it('IN 50 raises the balance to 50 and records who did it', async () => {
      const res = await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'IN', itemId, toLocId: zoneA, qty: 50, note: 'receipt' })
        .expect(201);
      expect(res.body.user.email).toBe(clerkEmail);
      expect(res.body.type).toBe('IN');
      expect(res.body.qty).toBe(50);
      expect(res.body.createdAt).toBeTruthy();
      expect((await detail()).totalQty).toBe(50);
    });

    it('OUT 20 lowers the balance to 30', async () => {
      await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'OUT', itemId, fromLocId: zoneA, qty: 20 })
        .expect(201);
      expect((await detail()).totalQty).toBe(30);
    });

    it('TRANSFER 10 moves stock between zones and conserves the total', async () => {
      await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'TRANSFER', itemId, fromLocId: zoneA, toLocId: zoneB, qty: 10 })
        .expect(201);

      const body = await detail();
      expect(body.totalQty).toBe(30);
      expect(qtyAt(body, zoneA)).toBe(20);
      expect(qtyAt(body, zoneB)).toBe(10);
      // The per-location breakdown always reconciles with the headline total.
      expect(
        body.stockLevels.reduce((sum: number, s: { qty: number }) => sum + s.qty, 0),
      ).toBe(body.totalQty);
    });

    it('refuses an over-draw with 400 and leaves the stored balance untouched', async () => {
      const before = qtyAt(await detail(), zoneA);
      const res = await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'OUT', itemId, fromLocId: zoneA, qty: before + 1 })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/insufficient stock/i);
      expect(qtyAt(await detail(), zoneA)).toBe(before);
    });

    it('lets exactly one of two simultaneous full-balance draw-downs win', async () => {
      const balance = qtyAt(await detail(), zoneB);
      expect(balance).toBeGreaterThan(0);

      const send = () =>
        http()
          .post('/api/movements')
          .set(auth(clerkToken))
          .send({ type: 'OUT', itemId, fromLocId: zoneB, qty: balance });
      const results = await Promise.all([send(), send()]);

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(1);
      expect(qtyAt(await detail(), zoneB)).toBe(0);
    });

    it('rejects a zero quantity and a same-location transfer', async () => {
      await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'IN', itemId, toLocId: zoneA, qty: 0 })
        .expect(400);
      await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'TRANSFER', itemId, fromLocId: zoneA, toLocId: zoneA, qty: 1 })
        .expect(400);
    });
  });

  // ── Requirement: manager-only reporting and audit log ────────────────────
  describe('reporting', () => {
    it('omits an item above its reorder point and includes it once it drops', async () => {
      const above = await http()
        .get('/api/reports/low-stock')
        .set(auth(managerToken))
        .expect(200);
      // 20 on hand against a reorder point of 10.
      expect(above.body.map((r: { id: string }) => r.id)).not.toContain(itemId);

      await http()
        .post('/api/movements')
        .set(auth(clerkToken))
        .send({ type: 'OUT', itemId, fromLocId: zoneA, qty: 12 })
        .expect(201);

      const below = await http()
        .get('/api/reports/low-stock')
        .set(auth(managerToken))
        .expect(200);
      const row = below.body.find((r: { id: string }) => r.id === itemId);
      expect(row).toBeDefined();
      expect(row.totalQty).toBe(8);
      expect(row.deficit).toBe(2);
    });

    it('hides the report and the audit log from a clerk', async () => {
      await http().get('/api/reports/low-stock').set(auth(clerkToken)).expect(403);
      await http().get('/api/movements').set(auth(clerkToken)).expect(403);
    });

    it('filters the audit log by item, type and date range', async () => {
      const byItem = await http()
        .get(`/api/movements?itemId=${itemId}`)
        .set(auth(managerToken))
        .expect(200);
      expect(byItem.body.rows.length).toBeGreaterThan(0);
      expect(
        byItem.body.rows.every((r: { itemId: string }) => r.itemId === itemId),
      ).toBe(true);
      // Newest first.
      expect(byItem.body.rows[0].createdAt >=
        byItem.body.rows[byItem.body.rows.length - 1].createdAt).toBe(true);

      const byType = await http()
        .get(`/api/movements?itemId=${itemId}&type=IN`)
        .set(auth(managerToken))
        .expect(200);
      expect(byType.body.rows.every((r: { type: string }) => r.type === 'IN')).toBe(
        true,
      );

      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      const future = await http()
        .get(`/api/movements?itemId=${itemId}&from=${tomorrow}`)
        .set(auth(managerToken))
        .expect(200);
      expect(future.body.rows).toHaveLength(0);

      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const recent = await http()
        .get(`/api/movements?itemId=${itemId}&from=${hourAgo}`)
        .set(auth(managerToken))
        .expect(200);
      expect(recent.body.rows).toHaveLength(byItem.body.rows.length);
    });
  });

  // ── Requirement: the audit trail cannot be orphaned ──────────────────────
  describe('referential safety', () => {
    it('refuses to delete an item or a location that the log references', async () => {
      await http()
        .delete(`/api/items/${itemId}`)
        .set(auth(managerToken))
        .expect(409);
      await http()
        .delete(`/api/locations/${zoneA}`)
        .set(auth(managerToken))
        .expect(409);
    });

    it('returns 404 for an unknown item', async () => {
      await http()
        .get('/api/items/does-not-exist')
        .set(auth(managerToken))
        .expect(404);
    });
  });

  describe('health', () => {
    it('serves a public liveness and a database-backed readiness probe', async () => {
      await http().get('/api/health').expect(200, { status: 'ok' });
      const deep = await http().get('/api/health/deep').expect(200);
      expect(deep.body).toEqual({ status: 'ok', db: 'ok' });
    });
  });
});
