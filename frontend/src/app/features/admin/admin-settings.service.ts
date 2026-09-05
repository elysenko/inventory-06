import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE } from '../../core/api-base';
import type { SettingsService } from '../../shared/models';

export interface SettingEntry {
  key: string;
  value: string;
}

/**
 * REST client for /api/admin/settings — credential status for the backing
 * services (PostgreSQL, MinIO). Values come back masked; the API never returns
 * a credential in a reusable form.
 */
@Injectable({ providedIn: 'root' })
export class AdminSettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE}/admin/settings`;

  list(): Observable<SettingsService[]> {
    return this.http.get<SettingsService[]>(this.url);
  }

  /** Upserts credentials and returns the refreshed, re-masked status. */
  update(entries: SettingEntry[]): Observable<SettingsService[]> {
    return this.http.patch<SettingsService[]>(this.url, { entries });
  }
}
