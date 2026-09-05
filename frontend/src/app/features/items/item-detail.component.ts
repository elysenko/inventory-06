import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { ItemDetail, Movement, StockLevel } from '../../shared/models';

const ZONE_A = { id: 'loc-a', name: 'Zone A', zone: 'A' };
const ZONE_B = { id: 'loc-b', name: 'Zone B', zone: 'B' };
const ZONE_C = { id: 'loc-c', name: 'Zone C', zone: 'C' };

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, ErrorBannerComponent],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmingDelete = signal(false);

  /** GET /api/items/:id — item plus its per-location breakdown. */
  readonly items = signal<ItemDetail[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: 'Zinc-plated, DIN 933', unit: 'box', reorderAt: 10, totalQty: 8,
      stockLevels: [
        { id: 'sl-1', itemId: 'itm-001', locationId: 'loc-a', qty: 5, location: ZONE_A },
        { id: 'sl-2', itemId: 'itm-001', locationId: 'loc-b', qty: 3, location: ZONE_B },
      ] },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: 'Natural nylon 6/6', unit: 'bag', reorderAt: 25, totalQty: 140,
      stockLevels: [
        { id: 'sl-3', itemId: 'itm-002', locationId: 'loc-a', qty: 90, location: ZONE_A },
        { id: 'sl-4', itemId: 'itm-002', locationId: 'loc-c', qty: 50, location: ZONE_C },
      ] },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: 'Powder-coated mild steel', unit: 'each', reorderAt: 15, totalQty: 15,
      stockLevels: [{ id: 'sl-5', itemId: 'itm-003', locationId: 'loc-b', qty: 15, location: ZONE_B }] },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: 'UV-stable, black', unit: 'pack', reorderAt: 30, totalQty: 12,
      stockLevels: [
        { id: 'sl-6', itemId: 'itm-004', locationId: 'loc-a', qty: 4, location: ZONE_A },
        { id: 'sl-7', itemId: 'itm-004', locationId: 'loc-b', qty: 8, location: ZONE_B },
      ] },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: 'Anti-fog polycarbonate', unit: 'each', reorderAt: 20, totalQty: 64,
      stockLevels: [{ id: 'sl-8', itemId: 'itm-005', locationId: 'loc-a', qty: 64, location: ZONE_A }] },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: 'Powder-free, 100 per box', unit: 'box', reorderAt: 40, totalQty: 96,
      stockLevels: [
        { id: 'sl-9', itemId: 'itm-006', locationId: 'loc-b', qty: 60, location: ZONE_B },
        { id: 'sl-10', itemId: 'itm-006', locationId: 'loc-c', qty: 36, location: ZONE_C },
      ] },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: '500mm × 300m stretch film', unit: 'roll', reorderAt: 12, totalQty: 5,
      stockLevels: [{ id: 'sl-11', itemId: 'itm-007', locationId: 'loc-c', qty: 5, location: ZONE_C }] },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: '100mm × 150mm, 500 labels', unit: 'roll', reorderAt: 8, totalQty: 22,
      stockLevels: [
        { id: 'sl-12', itemId: 'itm-008', locationId: 'loc-a', qty: 10, location: ZONE_A },
        { id: 'sl-13', itemId: 'itm-008', locationId: 'loc-c', qty: 12, location: ZONE_C },
      ] },
  ]);

  /** GET /api/movements?itemId=… — the audit trail embedded under the tab. */
  readonly movements = signal<Movement[]>([
    { id: 'mv-01', type: 'OUT', itemId: 'itm-001', qty: 4, note: 'Line 3 rebuild', createdAt: '2026-09-04T14:32:00.000Z',
      user: { email: 'preview.clerk@stockroom.local', role: 'CLERK' }, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: null },
    { id: 'mv-02', type: 'TRANSFER', itemId: 'itm-001', qty: 3, note: 'Rebalance to picking face', createdAt: '2026-09-03T09:15:00.000Z',
      user: { email: 'preview.manager@stockroom.local', role: 'MANAGER' }, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: ZONE_B },
    { id: 'mv-03', type: 'IN', itemId: 'itm-001', qty: 15, note: 'PO-4417 receipt', createdAt: '2026-09-01T08:02:00.000Z',
      user: { email: 'preview.clerk@stockroom.local', role: 'CLERK' }, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-04', type: 'IN', itemId: 'itm-002', qty: 90, note: 'PO-4418 receipt', createdAt: '2026-08-31T11:40:00.000Z',
      user: { email: 'preview.clerk@stockroom.local', role: 'CLERK' }, item: { sku: 'SKU-002', name: 'Nylon Washer 12mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-05', type: 'OUT', itemId: 'itm-004', qty: 18, note: 'Harness kitting', createdAt: '2026-08-30T16:05:00.000Z',
      user: { email: 'preview.clerk@stockroom.local', role: 'CLERK' }, item: { sku: 'SKU-004', name: 'Cable Tie 200mm' }, fromLoc: ZONE_B, toLoc: null },
    { id: 'mv-06', type: 'TRANSFER', itemId: 'itm-008', qty: 12, note: null, createdAt: '2026-08-29T13:20:00.000Z',
      user: { email: 'preview.manager@stockroom.local', role: 'MANAGER' }, item: { sku: 'SKU-008', name: 'Thermal Label Roll' }, fromLoc: ZONE_A, toLoc: ZONE_C },
    { id: 'mv-07', type: 'OUT', itemId: 'itm-007', qty: 7, note: 'Outbound wrapping', createdAt: '2026-08-28T07:55:00.000Z',
      user: { email: 'preview.clerk@stockroom.local', role: 'CLERK' }, item: { sku: 'SKU-007', name: 'Pallet Wrap Roll' }, fromLoc: ZONE_C, toLoc: null },
    { id: 'mv-08', type: 'IN', itemId: 'itm-006', qty: 96, note: 'Quarterly PPE order', createdAt: '2026-08-26T10:10:00.000Z',
      user: { email: 'preview.manager@stockroom.local', role: 'MANAGER' }, item: { sku: 'SKU-006', name: 'Nitrile Gloves M' }, fromLoc: null, toLoc: ZONE_B },
  ]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly qp = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id') ?? '');

  readonly item = computed(
    () => this.items().find((i) => i.id === this.itemId()) ?? null,
  );

  readonly tab = computed(() =>
    this.qp().get('tab') === 'movements' && this.auth.isManager()
      ? 'movements'
      : 'breakdown',
  );

  readonly breakdown = computed<StockLevel[]>(() => this.item()?.stockLevels ?? []);

  readonly breakdownTotal = computed(() =>
    this.breakdown().reduce((sum, level) => sum + level.qty, 0),
  );

  readonly itemMovements = computed(() =>
    this.movements().filter((m) => m.itemId === this.itemId()),
  );

  readonly isLow = computed(() => {
    const item = this.item();
    return !!item && item.totalQty <= item.reorderAt;
  });

  selectTab(tab: 'breakdown' | 'movements'): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  badgeClass(type: Movement['type']): string {
    return type === 'IN' ? 'badge-in' : type === 'OUT' ? 'badge-out' : 'badge-transfer';
  }

  requestDelete(): void {
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  /** DELETE /api/items/:id answers 409 when movements reference the item. */
  confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.error.set(
      this.itemMovements().length > 0
        ? 'This item cannot be deleted: it is referenced by ' +
            this.itemMovements().length +
            ' recorded movement(s). Deleting it would break the audit trail.'
        : 'Item deleted.',
    );
  }
}
