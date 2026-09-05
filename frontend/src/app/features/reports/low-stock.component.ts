import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { apiMessage } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewLowStock } from '../../shared/preview-data';
import type { LowStockRow } from '../../shared/models';
import { ReportsService } from './reports.service';

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
  private readonly api = inject(ReportsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** GET /api/reports/low-stock — totalQty <= reorderAt, worst deficit first. */
  readonly rows = signal<LowStockRow[]>([]);

  readonly totalDeficit = computed(() =>
    this.rows().reduce((sum, row) => sum + row.deficit, 0),
  );

  readonly criticalCount = computed(
    () => this.rows().filter((row) => row.deficit > 0).length,
  );

  constructor() {
    if (PREVIEW_MODE) {
      this.rows.set(previewLowStock());
      return;
    }
    this.loading.set(true);
    this.api.lowStock().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiMessage(err, 'Could not load the low-stock report.'));
        this.loading.set(false);
      },
    });
  }

  severity(row: LowStockRow): string {
    return row.deficit > 0 ? 'badge-out' : 'badge-low';
  }

  open(row: LowStockRow): void {
    void this.router.navigate(['/items', row.id]);
  }
}
