import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Item, Location, Movement, MovementType } from '../../shared/models';

const ZONE_A: Location = { id: 'loc-a', name: 'Zone A', zone: 'A' };
const ZONE_B: Location = { id: 'loc-b', name: 'Zone B', zone: 'B' };
const ZONE_C: Location = { id: 'loc-c', name: 'Zone C', zone: 'C' };

const CLERK = { email: 'preview.clerk@stockroom.local', role: 'CLERK' as const };
const MANAGER = { email: 'preview.manager@stockroom.local', role: 'MANAGER' as const };

const PAGE_SIZE = 8;

@Component({
  selector: 'app-movement-log',
  standalone: true,
  imports: [RouterLink, DatePipe, ErrorBannerComponent],
  templateUrl: './movement-log.component.html',
  styleUrl: './movement-log.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementLogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSize = PAGE_SIZE;

  readonly types = signal<MovementType[]>(['IN', 'OUT', 'TRANSFER']);

  /** GET /api/items — populates the item filter. */
  readonly items = signal<Item[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: null, unit: 'box', reorderAt: 10, totalQty: 8 },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: null, unit: 'bag', reorderAt: 25, totalQty: 140 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: null, unit: 'each', reorderAt: 15, totalQty: 15 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: null, unit: 'pack', reorderAt: 30, totalQty: 12 },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: null, unit: 'each', reorderAt: 20, totalQty: 64 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: null, unit: 'box', reorderAt: 40, totalQty: 96 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: null, unit: 'roll', reorderAt: 12, totalQty: 5 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: null, unit: 'roll', reorderAt: 8, totalQty: 22 },
  ]);

  /** GET /api/movements — newest first, as the API returns them. */
  readonly movements = signal<Movement[]>([
    { id: 'mv-01', type: 'OUT', itemId: 'itm-001', qty: 4, note: 'Line 3 rebuild', createdAt: '2026-09-04T14:32:00.000Z', user: CLERK, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: null },
    { id: 'mv-02', type: 'TRANSFER', itemId: 'itm-001', qty: 3, note: 'Rebalance to picking face', createdAt: '2026-09-03T09:15:00.000Z', user: MANAGER, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: ZONE_B },
    { id: 'mv-03', type: 'IN', itemId: 'itm-001', qty: 15, note: 'PO-4417 receipt', createdAt: '2026-09-01T08:02:00.000Z', user: CLERK, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-04', type: 'IN', itemId: 'itm-002', qty: 90, note: 'PO-4418 receipt', createdAt: '2026-08-31T11:40:00.000Z', user: CLERK, item: { sku: 'SKU-002', name: 'Nylon Washer 12mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-05', type: 'OUT', itemId: 'itm-004', qty: 18, note: 'Harness kitting', createdAt: '2026-08-30T16:05:00.000Z', user: CLERK, item: { sku: 'SKU-004', name: 'Cable Tie 200mm' }, fromLoc: ZONE_B, toLoc: null },
    { id: 'mv-06', type: 'TRANSFER', itemId: 'itm-008', qty: 12, note: null, createdAt: '2026-08-29T13:20:00.000Z', user: MANAGER, item: { sku: 'SKU-008', name: 'Thermal Label Roll' }, fromLoc: ZONE_A, toLoc: ZONE_C },
    { id: 'mv-07', type: 'OUT', itemId: 'itm-007', qty: 7, note: 'Outbound wrapping', createdAt: '2026-08-28T07:55:00.000Z', user: CLERK, item: { sku: 'SKU-007', name: 'Pallet Wrap Roll' }, fromLoc: ZONE_C, toLoc: null },
    { id: 'mv-08', type: 'IN', itemId: 'itm-006', qty: 96, note: 'Quarterly PPE order', createdAt: '2026-08-26T10:10:00.000Z', user: MANAGER, item: { sku: 'SKU-006', name: 'Nitrile Gloves M' }, fromLoc: null, toLoc: ZONE_B },
    { id: 'mv-09', type: 'TRANSFER', itemId: 'itm-006', qty: 36, note: 'Overflow to Zone C', createdAt: '2026-08-25T15:48:00.000Z', user: MANAGER, item: { sku: 'SKU-006', name: 'Nitrile Gloves M' }, fromLoc: ZONE_B, toLoc: ZONE_C },
    { id: 'mv-10', type: 'IN', itemId: 'itm-005', qty: 64, note: 'PO-4402 receipt', createdAt: '2026-08-24T09:30:00.000Z', user: CLERK, item: { sku: 'SKU-005', name: 'Safety Goggles' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-11', type: 'IN', itemId: 'itm-003', qty: 15, note: 'PO-4399 receipt', createdAt: '2026-08-22T12:05:00.000Z', user: CLERK, item: { sku: 'SKU-003', name: 'Steel Bracket L90' }, fromLoc: null, toLoc: ZONE_B },
    { id: 'mv-12', type: 'IN', itemId: 'itm-004', qty: 30, note: 'PO-4398 receipt', createdAt: '2026-08-21T08:44:00.000Z', user: CLERK, item: { sku: 'SKU-004', name: 'Cable Tie 200mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-13', type: 'IN', itemId: 'itm-002', qty: 50, note: 'PO-4397 receipt', createdAt: '2026-08-20T10:12:00.000Z', user: MANAGER, item: { sku: 'SKU-002', name: 'Nylon Washer 12mm' }, fromLoc: null, toLoc: ZONE_C },
    { id: 'mv-14', type: 'IN', itemId: 'itm-007', qty: 12, note: 'PO-4396 receipt', createdAt: '2026-08-19T14:26:00.000Z', user: CLERK, item: { sku: 'SKU-007', name: 'Pallet Wrap Roll' }, fromLoc: null, toLoc: ZONE_C },
    { id: 'mv-15', type: 'IN', itemId: 'itm-008', qty: 22, note: 'PO-4395 receipt', createdAt: '2026-08-18T11:03:00.000Z', user: MANAGER, item: { sku: 'SKU-008', name: 'Thermal Label Roll' }, fromLoc: null, toLoc: ZONE_A },
  ]);

  private readonly qp = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.qp().get('itemId') ?? '');
  readonly typeFilter = computed(() => this.qp().get('type') ?? '');
  readonly from = computed(() => this.qp().get('from') ?? '');
  readonly to = computed(() => this.qp().get('to') ?? '');
  readonly page = computed(() => {
    const raw = Number(this.qp().get('page') ?? '1');
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  });

  readonly filtered = computed(() => {
    const itemId = this.itemId();
    const type = this.typeFilter();
    const from = this.from() ? Date.parse(`${this.from()}T00:00:00.000Z`) : null;
    const to = this.to() ? Date.parse(`${this.to()}T23:59:59.999Z`) : null;

    return this.movements().filter((movement) => {
      if (itemId && movement.itemId !== itemId) {
        return false;
      }
      if (type && movement.type !== type) {
        return false;
      }
      const at = Date.parse(movement.createdAt);
      if (from !== null && at < from) {
        return false;
      }
      if (to !== null && at > to) {
        return false;
      }
      return true;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)),
  );
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly visible = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  readonly hasFilters = computed(
    () => !!(this.itemId() || this.typeFilter() || this.from() || this.to()),
  );

  badgeClass(type: MovementType): string {
    return type === 'IN' ? 'badge-in' : type === 'OUT' ? 'badge-out' : 'badge-transfer';
  }

  onItemChange(event: Event): void {
    this.patch({ itemId: (event.target as HTMLSelectElement).value || null, page: null });
  }

  onTypeChange(event: Event): void {
    this.patch({ type: (event.target as HTMLSelectElement).value || null, page: null });
  }

  onFromChange(event: Event): void {
    this.patch({ from: (event.target as HTMLInputElement).value || null, page: null });
  }

  onToChange(event: Event): void {
    this.patch({ to: (event.target as HTMLInputElement).value || null, page: null });
  }

  goToPage(page: number): void {
    this.patch({ page: page > 1 ? String(page) : null });
  }

  clearFilters(): void {
    this.patch({ itemId: null, type: null, from: null, to: null, page: null });
  }

  private patch(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
