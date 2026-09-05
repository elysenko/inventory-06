import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';

/** Catalogue row as the SPA consumes it: the item plus its rolled-up balance. */
export interface ItemRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderAt: number;
  totalQty: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemDetail extends ItemRow {
  stockLevels: {
    id: string;
    itemId: string;
    locationId: string;
    qty: number;
    location: { id: string; name: string; zone: string };
  }[];
}

const LEVEL_SELECT = {
  id: true,
  itemId: true,
  locationId: true,
  qty: true,
} as const;

type ItemWithLevels = Prisma.ItemGetPayload<{
  include: { stockLevels: true };
}>;

/** Sum of every per-location balance. Empty catalogue rows total zero. */
export function totalOnHand(levels: { qty: number }[]): number {
  return levels.reduce((sum, level) => sum + level.qty, 0);
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catalogue listing. `q` matches sku or name case-insensitively; `lowStock`
   * keeps only rows at or below their reorder threshold. The low-stock filter
   * is applied after the roll-up because the threshold compares against the
   * sum across locations, which SQL cannot express in the same WHERE clause.
   */
  async findAll(query: QueryItemsDto): Promise<ItemRow[]> {
    const where: Prisma.ItemWhereInput = query.q
      ? {
          OR: [
            { sku: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const items = await this.prisma.item.findMany({
      where,
      include: { stockLevels: true },
      orderBy: { sku: 'asc' },
    });

    const rows = items.map((item) => ItemsService.toRow(item));
    return query.lowStock
      ? rows.filter((row) => row.totalQty <= row.reorderAt)
      : rows;
  }

  /** Item plus the per-location breakdown whose quantities sum to totalQty. */
  async findOne(id: string): Promise<ItemDetail> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        stockLevels: {
          select: {
            ...LEVEL_SELECT,
            location: { select: { id: true, name: true, zone: true } },
          },
          orderBy: { location: { name: 'asc' } },
        },
      },
    });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }

    const { stockLevels, ...rest } = item;
    return {
      ...rest,
      totalQty: totalOnHand(stockLevels),
      stockLevels,
    };
  }

  /** Duplicate sku surfaces as 400 `sku already exists` via the global filter. */
  async create(dto: CreateItemDto): Promise<ItemRow> {
    const item = await this.prisma.item.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description ?? null,
        unit: dto.unit,
        reorderAt: dto.reorderAt,
      },
      include: { stockLevels: true },
    });
    return ItemsService.toRow(item);
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemRow> {
    await this.ensureExists(id);
    const item = await this.prisma.item.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? null }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.reorderAt !== undefined ? { reorderAt: dto.reorderAt } : {}),
      },
      include: { stockLevels: true },
    });
    return ItemsService.toRow(item);
  }

  /**
   * Deleting an item that appears in the audit log is refused (409) — the
   * movement history must stay readable. Items never moved delete cleanly and
   * their StockLevel rows cascade.
   */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureExists(id);
    const movements = await this.prisma.movement.count({ where: { itemId: id } });
    if (movements > 0) {
      throw new ConflictException(
        `Item has ${movements} movement(s) in the audit log and cannot be deleted`,
      );
    }
    await this.prisma.item.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.item.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Item ${id} not found`);
    }
  }

  private static toRow(item: ItemWithLevels): ItemRow {
    const { stockLevels, ...rest } = item;
    return { ...rest, totalQty: totalOnHand(stockLevels) };
  }
}
