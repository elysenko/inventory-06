import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';

const DEFAULT_PAGE_SIZE = 25;

/** Everything the audit-log table renders for one row. */
const MOVEMENT_INCLUDE = {
  user: { select: { email: true, role: true } },
  item: { select: { sku: true, name: true } },
  fromLoc: true,
  toLoc: true,
} as const;

export type MovementRow = Prisma.MovementGetPayload<{
  include: typeof MOVEMENT_INCLUDE;
}>;

export interface PaginatedMovements {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Which endpoints each movement type requires. */
const REQUIRES: Record<MovementType, { from: boolean; to: boolean }> = {
  [MovementType.IN]: { from: false, to: true },
  [MovementType.OUT]: { from: true, to: false },
  [MovementType.TRANSFER]: { from: true, to: true },
};

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one movement and applies it to the affected balances inside a
   * single transaction, so the audit row and the balance change can never
   * land apart.
   *
   * The decrement is a *guarded* `updateMany` with `qty: { gte }` in the WHERE
   * clause rather than a read-then-write: Postgres re-evaluates that predicate
   * after taking the row lock, so two concurrent OUT movements for the same
   * balance can never both succeed and the stored quantity can never go
   * negative. Do not refactor this into `findUnique` followed by `update`.
   */
  async create(dto: CreateMovementDto, user: AuthUser): Promise<MovementRow> {
    const { type, qty } = dto;
    const fromLocId = this.normaliseLoc(dto.fromLocId);
    const toLocId = this.normaliseLoc(dto.toLocId);
    const needs = REQUIRES[type];

    if (needs.from && !fromLocId) {
      throw new BadRequestException(`${type} requires fromLocId`);
    }
    if (needs.to && !toLocId) {
      throw new BadRequestException(`${type} requires toLocId`);
    }
    if (type === MovementType.TRANSFER && fromLocId === toLocId) {
      throw new BadRequestException(
        'TRANSFER requires two different locations',
      );
    }

    // Locations irrelevant to this movement type are dropped so the audit row
    // reads unambiguously (an IN never carries a source).
    const source = needs.from ? fromLocId : null;
    const destination = needs.to ? toLocId : null;

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id: dto.itemId },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(`Item ${dto.itemId} does not exist`);
      }

      for (const locationId of [source, destination]) {
        if (!locationId) continue;
        const location = await tx.location.findUnique({
          where: { id: locationId },
          select: { id: true },
        });
        if (!location) {
          throw new BadRequestException(
            `Location ${locationId} does not exist`,
          );
        }
      }

      if (source) {
        const drawn = await tx.stockLevel.updateMany({
          where: {
            itemId: dto.itemId,
            locationId: source,
            qty: { gte: qty },
          },
          data: { qty: { decrement: qty } },
        });
        if (drawn.count === 0) {
          // Nothing was written: the balance is left exactly as it was.
          throw new BadRequestException('Insufficient stock');
        }
      }

      if (destination) {
        await tx.stockLevel.upsert({
          where: {
            itemId_locationId: { itemId: dto.itemId, locationId: destination },
          },
          create: { itemId: dto.itemId, locationId: destination, qty },
          update: { qty: { increment: qty } },
        });
      }

      return tx.movement.create({
        data: {
          type,
          itemId: dto.itemId,
          fromLocId: source,
          toLocId: destination,
          qty,
          note: dto.note ?? null,
          userId: user.id,
        },
        include: MOVEMENT_INCLUDE,
      });
    });
  }

  /** Filterable, paginated audit log, newest first. */
  async findAll(query: QueryMovementsDto): Promise<PaginatedMovements> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = new Date(query.to);

    const where: Prisma.MovementWhereInput = {
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.movement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.movement.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }

  /** Treats an empty string from a form field as "not supplied". */
  private normaliseLoc(value: string | null | undefined): string | null {
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : null;
  }
}
