import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { LowStockRow } from '../../shared/models';

@Component({
  selector: 'app-low-stock',
  standalone: true,
  imports: [RouterLink, ErrorBannerComponent],
  templateUrl: './low-stock.component.html',
  styleUrl: './low-stock.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent {
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** GET /api/reports/low-stock — totalQty <= reorderAt, worst deficit first. */
  readonly rows = signal<LowStockRow[]>([
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', unit: 'pack', reorderAt: 30, totalQty: 12, deficit: 18 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', unit: 'roll', reorderAt: 12, totalQty: 5, deficit: 7 },
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', unit: 'box', reorderAt: 10, totalQty: 8, deficit: 2 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', unit: 'each', reorderAt: 15, totalQty: 15, deficit: 0 },
  ]);

  readonly totalDeficit = computed(() =>
    this.rows().reduce((sum, row) => sum + row.deficit, 0),
  );

  readonly criticalCount = computed(
    () => this.rows().filter((row) => row.deficit > 0).length,
  );

  severity(row: LowStockRow): string {
    return row.deficit > 0 ? 'badge-out' : 'badge-low';
  }

  open(row: LowStockRow): void {
    void this.router.navigate(['/items', row.id]);
  }
}
