import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Item } from '../../shared/models';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [RouterLink, ErrorBannerComponent],
  templateUrl: './item-list.component.html',
  styleUrl: './item-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSize = PAGE_SIZE;

  /** Catalogue rows — GET /api/items maps each item to `{ ...item, totalQty }`. */
  readonly items = signal<Item[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: 'Zinc-plated, DIN 933', unit: 'box', reorderAt: 10, totalQty: 8 },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: 'Natural nylon 6/6', unit: 'bag', reorderAt: 25, totalQty: 140 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: 'Powder-coated mild steel', unit: 'each', reorderAt: 15, totalQty: 15 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: 'UV-stable, black', unit: 'pack', reorderAt: 30, totalQty: 12 },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: 'Anti-fog polycarbonate', unit: 'each', reorderAt: 20, totalQty: 64 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: 'Powder-free, 100 per box', unit: 'box', reorderAt: 40, totalQty: 96 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: '500mm × 300m stretch film', unit: 'roll', reorderAt: 12, totalQty: 5 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: '100mm × 150mm, 500 labels', unit: 'roll', reorderAt: 8, totalQty: 22 },
  ]);

  private readonly qp = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly search = computed(() => this.qp().get('q') ?? '');
  readonly lowStockOnly = computed(() => this.qp().get('lowStock') === 'true');
  readonly page = computed(() => {
    const raw = Number(this.qp().get('page') ?? '1');
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  });

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const lowOnly = this.lowStockOnly();
    return this.items().filter((item) => {
      const matches =
        !term ||
        item.sku.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term);
      const low = !lowOnly || item.totalQty <= item.reorderAt;
      return matches && low;
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

  readonly lowStockCount = computed(
    () => this.items().filter((i) => i.totalQty <= i.reorderAt).length,
  );

  isLow(item: Item): boolean {
    return item.totalQty <= item.reorderAt;
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchParams({ q: value || null, page: null });
  }

  onLowStockToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.patchParams({ lowStock: checked ? 'true' : null, page: null });
  }

  goToPage(page: number): void {
    this.patchParams({ page: page > 1 ? String(page) : null });
  }

  openItem(item: Item): void {
    void this.router.navigate(['/items', item.id]);
  }

  clearFilters(): void {
    this.patchParams({ q: null, lowStock: null, page: null });
  }

  private patchParams(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
