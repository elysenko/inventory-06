import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewItems } from '../../shared/preview-data';
import type { Item } from '../../shared/models';
import { ItemsService } from './items.service';

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
  private readonly api = inject(ItemsService);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSize = PAGE_SIZE;

  /**
   * The full catalogue from GET /api/items, each row carrying the `totalQty`
   * roll-up the API computes across every location.
   *
   * The whole catalogue is fetched once and the search / low-stock / paging
   * filters stay client-side. The API supports `?q=` and `?lowStock=` too, but
   * the header reads "{{ filtered().length }} of {{ items().length }}" — that
   * count is only meaningful when `items()` holds the unfiltered catalogue.
   */
  readonly items = signal<Item[]>([]);

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

  constructor() {
    if (PREVIEW_MODE) {
      this.items.set(previewItems());
      return;
    }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiMessage(err, 'Could not load the item catalogue.'));
        this.loading.set(false);
      },
    });
  }

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
