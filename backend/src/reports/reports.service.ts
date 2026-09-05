import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { totalOnHand } from '../items/items.service';

/** One row of the low-stock report. */
export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
  /** How far below the threshold the item sits; 0 when exactly at it. */
  deficit: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Items whose balance across every location is at or below their reorder
   * threshold, worst shortfall first.
   *
   * The roll-up runs in JS because the threshold compares against a SUM over
   * a child table. That is fine at catalogue scale; if the catalogue grows
   * past a few thousand rows, move it to a `$queryRaw` with
   * `GROUP BY ... HAVING COALESCE(SUM(qty), 0) <= "reorderAt"`.
   */
  async lowStock(): Promise<LowStockRow[]> {
    const items = await this.prisma.item.findMany({
      include: { stockLevels: { select: { qty: true } } },
      orderBy: { sku: 'asc' },
    });

    return items
      .map((item) => {
        const totalQty = totalOnHand(item.stockLevels);
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          reorderAt: item.reorderAt,
          totalQty,
          deficit: Math.max(0, item.reorderAt - totalQty),
        };
      })
      .filter((row) => row.totalQty <= row.reorderAt)
      .sort(
        (a, b) =>
          a.totalQty - a.reorderAt - (b.totalQty - b.reorderAt) ||
          a.sku.localeCompare(b.sku),
      );
  }
}
