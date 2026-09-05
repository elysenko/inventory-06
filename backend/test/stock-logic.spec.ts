import { BadRequestException } from '@nestjs/common';
import { MovementType, Role } from '@prisma/client';

import { totalOnHand } from '../src/items/items.service';
import { MovementsService } from '../src/movements/movements.service';
import { ReportsService } from '../src/reports/reports.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CreateMovementDto } from '../src/movements/dto/create-movement.dto';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Pure-logic coverage: no database, no HTTP. Everything here is the arithmetic
 * and the branch selection that the spec's Requirements turn on, exercised
 * directly so a regression shows up in milliseconds rather than in a deploy.
 */

const CLERK: AuthUser = { id: 'u1', email: 'clerk@test', role: Role.USER };

function dto(partial: Partial<CreateMovementDto>): CreateMovementDto {
  return {
    type: MovementType.IN,
    itemId: 'item-1',
    qty: 1,
    ...partial,
  } as CreateMovementDto;
}

describe('totalOnHand', () => {
  it('sums every per-location balance', () => {
    expect(totalOnHand([{ qty: 20 }, { qty: 10 }])).toBe(30);
  });

  it('is zero for an item stocked nowhere', () => {
    expect(totalOnHand([])).toBe(0);
  });
});

describe('ReportsService.lowStock', () => {
  function serviceFor(
    items: { id: string; sku: string; reorderAt: number; qtys: number[] }[],
  ): ReportsService {
    const prisma = {
      item: {
        findMany: jest.fn().mockResolvedValue(
          items.map((i) => ({
            id: i.id,
            sku: i.sku,
            name: `Item ${i.sku}`,
            unit: 'box',
            reorderAt: i.reorderAt,
            stockLevels: i.qtys.map((qty) => ({ qty })),
          })),
        ),
      },
    } as unknown as PrismaService;
    return new ReportsService(prisma);
  }

  it('includes an item at or below its reorder point and excludes one above', async () => {
    const rows = await serviceFor([
      { id: 'a', sku: 'SKU-001', reorderAt: 10, qtys: [7] }, // 12 then OUT 5
      { id: 'b', sku: 'SKU-002', reorderAt: 10, qtys: [40] },
      { id: 'c', sku: 'SKU-003', reorderAt: 10, qtys: [4, 6] }, // exactly at
    ]).lowStock();

    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
    expect(rows.find((r) => r.id === 'a')?.deficit).toBe(3);
    // "at the threshold" is low stock, but the shortfall is zero.
    expect(rows.find((r) => r.id === 'c')?.deficit).toBe(0);
  });

  it('sorts by worst shortfall first', async () => {
    const rows = await serviceFor([
      { id: 'mild', sku: 'SKU-100', reorderAt: 10, qtys: [9] },
      { id: 'severe', sku: 'SKU-200', reorderAt: 10, qtys: [0] },
    ]).lowStock();

    expect(rows.map((r) => r.id)).toEqual(['severe', 'mild']);
  });

  it('rolls the balance up across locations before comparing', async () => {
    // 6 + 6 = 12 > 10, so an item that is low in each location alone is not low.
    const rows = await serviceFor([
      { id: 'split', sku: 'SKU-300', reorderAt: 10, qtys: [6, 6] },
    ]).lowStock();

    expect(rows).toEqual([]);
  });
});

describe('MovementsService.create — required endpoints', () => {
  /** A prisma double that fails loudly if the guard clauses let a write through. */
  const unusedPrisma = {
    $transaction: jest.fn(() => {
      throw new Error('transaction must not be opened for an invalid movement');
    }),
  } as unknown as PrismaService;

  const service = new MovementsService(unusedPrisma);

  it('rejects IN without a destination', async () => {
    await expect(
      service.create(dto({ type: MovementType.IN }), CLERK),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects OUT without a source', async () => {
    await expect(
      service.create(dto({ type: MovementType.OUT, toLocId: 'loc-a' }), CLERK),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects TRANSFER missing either endpoint', async () => {
    await expect(
      service.create(
        dto({ type: MovementType.TRANSFER, fromLocId: 'loc-a' }),
        CLERK,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a TRANSFER whose endpoints are the same location', async () => {
    await expect(
      service.create(
        dto({
          type: MovementType.TRANSFER,
          fromLocId: 'loc-a',
          toLocId: 'loc-a',
        }),
        CLERK,
      ),
    ).rejects.toThrow(/two different locations/i);
  });

  it('treats a blank location string as not supplied', async () => {
    await expect(
      service.create(dto({ type: MovementType.IN, toLocId: '   ' }), CLERK),
    ).rejects.toThrow(/requires toLocId/);
  });
});

describe('MovementsService.create — balance mutation', () => {
  /**
   * Records the writes a movement performs so the ordering guarantees can be
   * asserted without a database: the guarded decrement must run before the
   * audit row, and a refused draw-down must write nothing at all.
   */
  function harness(drawnCount: number) {
    const calls: string[] = [];
    const tx = {
      item: { findUnique: jest.fn().mockResolvedValue({ id: 'item-1' }) },
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'loc' }) },
      stockLevel: {
        updateMany: jest.fn((args: unknown) => {
          calls.push('decrement');
          void args;
          return Promise.resolve({ count: drawnCount });
        }),
        upsert: jest.fn(() => {
          calls.push('increment');
          return Promise.resolve({});
        }),
      },
      movement: {
        create: jest.fn(() => {
          calls.push('audit');
          return Promise.resolve({ id: 'mv-1' });
        }),
      },
    };
    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    return { service: new MovementsService(prisma), tx, calls };
  }

  it('guards the decrement with qty >= requested and writes the audit row after it', async () => {
    const { service, tx, calls } = harness(1);

    await service.create(
      dto({ type: MovementType.OUT, fromLocId: 'loc-a', qty: 20 }),
      CLERK,
    );

    expect(tx.stockLevel.updateMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1', locationId: 'loc-a', qty: { gte: 20 } },
      data: { qty: { decrement: 20 } },
    });
    expect(calls).toEqual(['decrement', 'audit']);
  });

  it('refuses an over-draw and writes nothing', async () => {
    const { service, tx, calls } = harness(0);

    await expect(
      service.create(
        dto({ type: MovementType.OUT, fromLocId: 'loc-a', qty: 10 }),
        CLERK,
      ),
    ).rejects.toThrow(/insufficient stock/i);

    expect(tx.movement.create).not.toHaveBeenCalled();
    expect(tx.stockLevel.upsert).not.toHaveBeenCalled();
    expect(calls).toEqual(['decrement']);
  });

  it('moves a TRANSFER out of the source before into the destination', async () => {
    const { service, tx, calls } = harness(1);

    await service.create(
      dto({
        type: MovementType.TRANSFER,
        fromLocId: 'loc-a',
        toLocId: 'loc-b',
        qty: 10,
      }),
      CLERK,
    );

    expect(calls).toEqual(['decrement', 'increment', 'audit']);
    expect(tx.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { itemId: 'item-1', locationId: 'loc-b', qty: 10 },
        update: { qty: { increment: 10 } },
      }),
    );
  });

  it('drops the irrelevant endpoint so an IN never records a source', async () => {
    const { service, tx } = harness(1);

    await service.create(
      dto({
        type: MovementType.IN,
        toLocId: 'loc-a',
        fromLocId: 'loc-b',
        qty: 5,
      }),
      CLERK,
    );

    expect(tx.stockLevel.updateMany).not.toHaveBeenCalled();
    expect(tx.movement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromLocId: null, toLocId: 'loc-a' }),
      }),
    );
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard({
    getAllAndOverride: jest.fn(),
  } as never);

  function contextFor(role: Role | null) {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { id: 'u', email: 'e', role } } : {}),
      }),
    } as never;
  }

  function require(required: Role[] | undefined, role: Role | null): boolean {
    (guard as unknown as { reflector: { getAllAndOverride: jest.Mock } })
      .reflector.getAllAndOverride.mockReturnValue(required);
    return guard.canActivate(contextFor(role));
  }

  it('lets any authenticated principal through an unannotated handler', () => {
    expect(require(undefined, Role.USER)).toBe(true);
  });

  it('blocks a clerk from a MANAGER-only handler', () => {
    expect(() => require([Role.MANAGER], Role.USER)).toThrow(/role/i);
  });

  it('lets a manager and an admin through a MANAGER-only handler', () => {
    expect(require([Role.MANAGER], Role.MANAGER)).toBe(true);
    expect(require([Role.MANAGER], Role.ADMIN)).toBe(true);
  });

  it('blocks a manager from an ADMIN-only handler', () => {
    expect(() => require([Role.ADMIN], Role.MANAGER)).toThrow(/role/i);
  });
});
