import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiMessage, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewItemDetails, previewMovements } from '../../shared/preview-data';
import type { ItemDetail, Movement, StockLevel } from '../../shared/models';
import { MovementsService } from '../movements/movements.service';
import { ItemsService } from './items.service';

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
  private readonly api = inject(ItemsService);
  private readonly movementsApi = inject(MovementsService);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmingDelete = signal(false);

  /** GET /api/items/:id — item plus its per-location breakdown. */
  readonly item = signal<ItemDetail | null>(null);

  /** GET /api/movements?itemId=… — the audit trail embedded under the tab. */
  readonly movements = signal<Movement[]>([]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly qp = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id') ?? '');

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

  constructor() {
    // Re-loads whenever the :id segment changes, so navigating between two
    // items without leaving the route still refetches.
    effect(() => {
      const id = this.itemId();
      if (!id) {
        return;
      }
      if (PREVIEW_MODE) {
        this.item.set(previewItemDetails().find((i) => i.id === id) ?? null);
        this.movements.set(previewMovements());
        return;
      }
      this.load(id);
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get(id).subscribe({
      next: (detail) => {
        this.item.set(detail);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.item.set(null);
        this.loading.set(false);
        // A 404 is not an error worth shouting about: the template already
        // renders a dedicated "Item not found" state for a missing item.
        const failure = toApiError(err, 'Could not load this item.');
        this.error.set(failure.status === 404 ? null : failure.message);
      },
    });

    // The audit log is MANAGER-only; asking as a clerk would only earn a 403.
    if (!this.auth.isManager()) {
      this.movements.set([]);
      return;
    }
    this.movementsApi.list({ itemId: id, pageSize: 200 }).subscribe({
      next: (page) => this.movements.set(page.rows),
      error: () => this.movements.set([]),
    });
  }

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
    const item = this.item();
    if (!item) {
      return;
    }

    if (PREVIEW_MODE) {
      this.error.set(
        this.itemMovements().length > 0
          ? 'This item cannot be deleted: it is referenced by ' +
              this.itemMovements().length +
              ' recorded movement(s). Deleting it would break the audit trail.'
          : 'Item deleted.',
      );
      return;
    }

    this.api.remove(item.id).subscribe({
      next: () => void this.router.navigate(['/items']),
      error: (err: unknown) =>
        this.error.set(
          apiMessage(
            err,
            'This item cannot be deleted: it is referenced by recorded ' +
              'movement(s). Deleting it would break the audit trail.',
          ),
        ),
    });
  }
}
