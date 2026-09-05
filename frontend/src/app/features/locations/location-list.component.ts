import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { apiMessage } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewLocations } from '../../shared/preview-data';
import type { Location } from '../../shared/models';
import { LocationsService } from './locations.service';

@Component({
  selector: 'app-location-list',
  standalone: true,
  imports: [RouterLink, DatePipe, ErrorBannerComponent],
  templateUrl: './location-list.component.html',
  styleUrl: './location-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent {
  private readonly router = inject(Router);
  private readonly api = inject(LocationsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);

  /** GET /api/locations */
  readonly locations = signal<Location[]>([]);

  readonly pendingLocation = computed(
    () => this.locations().find((l) => l.id === this.pendingDelete()) ?? null,
  );

  constructor() {
    if (PREVIEW_MODE) {
      this.locations.set(previewLocations());
      return;
    }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (rows) => {
        this.locations.set(rows);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiMessage(err, 'Could not load locations.'));
        this.loading.set(false);
      },
    });
  }

  requestDelete(location: Location): void {
    this.error.set(null);
    this.notice.set(null);
    this.pendingDelete.set(location.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /**
   * The API is the only authority on whether a location can go: it answers 409
   * when the zone still holds stock or appears in the movement log. Nothing is
   * predicted client-side, so the answer cannot drift from the database.
   */
  confirmDelete(): void {
    const location = this.pendingLocation();
    this.pendingDelete.set(null);
    if (!location) {
      return;
    }

    const inUse =
      `${location.name} still holds stock or is referenced by recorded ` +
      `movements, so it cannot be deleted (409 Conflict). Move its stock ` +
      `elsewhere first.`;

    if (PREVIEW_MODE) {
      this.error.set(inUse);
      return;
    }

    this.api.remove(location.id).subscribe({
      next: () => {
        this.locations.update((rows) => rows.filter((l) => l.id !== location.id));
        this.notice.set(`${location.name} deleted.`);
      },
      error: (err: unknown) => this.error.set(apiMessage(err, inUse)),
    });
  }

  edit(location: Location): void {
    void this.router.navigate(['/locations', location.id, 'edit']);
  }
}
