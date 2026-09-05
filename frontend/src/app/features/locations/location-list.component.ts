import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Location } from '../../shared/models';

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

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);

  /** GET /api/locations */
  readonly locations = signal<Location[]>([
    { id: 'loc-a', name: 'Zone A', zone: 'A', createdAt: '2026-06-01T09:00:00.000Z' },
    { id: 'loc-b', name: 'Zone B', zone: 'B', createdAt: '2026-06-01T09:02:00.000Z' },
    { id: 'loc-c', name: 'Zone C', zone: 'C', createdAt: '2026-06-01T09:04:00.000Z' },
  ]);

  /** Locations currently holding stock or referenced by a movement — the API
   *  refuses to delete these with 409. */
  readonly lockedLocationIds = signal<string[]>(['loc-a', 'loc-b', 'loc-c']);

  readonly pendingLocation = computed(
    () => this.locations().find((l) => l.id === this.pendingDelete()) ?? null,
  );

  requestDelete(location: Location): void {
    this.error.set(null);
    this.notice.set(null);
    this.pendingDelete.set(location.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const location = this.pendingLocation();
    this.pendingDelete.set(null);
    if (!location) {
      return;
    }
    if (this.lockedLocationIds().includes(location.id)) {
      this.error.set(
        `${location.name} still holds stock or is referenced by recorded movements, so it cannot be deleted (409 Conflict). Move its stock elsewhere first.`,
      );
      return;
    }
    this.notice.set(`${location.name} deleted.`);
  }

  edit(location: Location): void {
    void this.router.navigate(['/locations', location.id, 'edit']);
  }
}
