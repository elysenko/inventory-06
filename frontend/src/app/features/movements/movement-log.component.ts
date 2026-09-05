import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';

import { apiMessage } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewItems, previewMovements } from '../../shared/preview-data';
import type { Item, Movement, MovementType } from '../../shared/models';
import { ItemsService } from '../items/items.service';
import { MAX_PAGE_SIZE, MovementsService } from './movements.service';

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
  private readonly api = inject(MovementsService);
  private readonly itemsApi = inject(ItemsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSize = PAGE_SIZE;

  readonly types = signal<MovementType[]>(['IN', 'OUT', 'TRANSFER']);

  /** GET /api/items — populates the item filter. */
  readonly items = signal<Item[]>([]);

  /**
   * GET /api/movements — newest first, as the API returns them.
   *
   * The log is fetched unfiltered and the item / type / date filters stay
   * client-side. The API can filter and paginate server-side, but the header
   * reads "{{ filtered().length }} matching {{ movements().length }} total",
   * and that total is only true when `movements()` holds the unfiltered log.
   */
  readonly movements = signal<Movement[]>([]);

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

  constructor() {
    if (PREVIEW_MODE) {
      this.items.set(previewItems());
      this.movements.set(previewMovements());
      return;
    }

    this.loading.set(true);
    // The API caps a page at 200 rows. Fetch the first page, then pull any
    // remaining pages and concatenate, so `movements()` really is the whole
    // log — the header's "N matching M total" would otherwise quietly lie.
    this.api
      .list({ pageSize: MAX_PAGE_SIZE })
      .pipe(
        switchMap((first) => {
          const pages = Math.ceil(first.total / MAX_PAGE_SIZE);
          if (pages <= 1) {
            return of(first.rows);
          }
          const rest = Array.from({ length: pages - 1 }, (_, i) =>
            this.api.list({ page: i + 2, pageSize: MAX_PAGE_SIZE }),
          );
          return forkJoin(rest).pipe(
            map((later) => [
              ...first.rows,
              ...later.flatMap((page) => page.rows),
            ]),
          );
        }),
      )
      .subscribe({
        next: (rows) => {
          this.movements.set(rows);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(apiMessage(err, 'Could not load the movement log.'));
          this.loading.set(false);
        },
      });

    this.itemsApi.list().subscribe({
      next: (rows) => this.items.set(rows),
      error: () => undefined,
    });
  }

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
