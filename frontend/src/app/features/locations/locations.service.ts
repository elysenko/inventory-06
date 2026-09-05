import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE } from '../../core/api-base';
import type { Location } from '../../shared/models';

export interface LocationPayload {
  name: string;
  zone: string;
}

/** REST client for /api/locations. Reads are open to any authenticated user;
 *  writes are rejected with 403 for anyone below MANAGER. */
@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE}/locations`;

  list(): Observable<Location[]> {
    return this.http.get<Location[]>(this.url);
  }

  get(id: string): Observable<Location> {
    return this.http.get<Location>(`${this.url}/${encodeURIComponent(id)}`);
  }

  create(payload: LocationPayload): Observable<Location> {
    return this.http.post<Location>(this.url, payload);
  }

  update(id: string, payload: Partial<LocationPayload>): Observable<Location> {
    return this.http.patch<Location>(
      `${this.url}/${encodeURIComponent(id)}`,
      payload,
    );
  }

  /** 409 when the location still holds stock or appears in the movement log. */
  remove(id: string): Observable<{ id: string; deleted: true }> {
    return this.http.delete<{ id: string; deleted: true }>(
      `${this.url}/${encodeURIComponent(id)}`,
    );
  }
}
