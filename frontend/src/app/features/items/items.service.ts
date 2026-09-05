import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE } from '../../core/api-base';
import type { Item, ItemDetail } from '../../shared/models';

export interface ItemPayload {
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderAt: number;
}

export interface ItemQuery {
  q?: string;
  lowStock?: boolean;
}

/** REST client for /api/items. */
@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE}/items`;

  /**
   * Catalogue rows, each already carrying the `totalQty` roll-up the API
   * computes across every location.
   */
  list(query: ItemQuery = {}): Observable<Item[]> {
    let params = new HttpParams();
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.lowStock) {
      params = params.set('lowStock', 'true');
    }
    return this.http.get<Item[]>(this.url, { params });
  }

  /** One item plus its per-location breakdown. */
  get(id: string): Observable<ItemDetail> {
    return this.http.get<ItemDetail>(`${this.url}/${encodeURIComponent(id)}`);
  }

  create(payload: ItemPayload): Observable<Item> {
    return this.http.post<Item>(this.url, payload);
  }

  update(id: string, payload: Partial<ItemPayload>): Observable<Item> {
    return this.http.patch<Item>(
      `${this.url}/${encodeURIComponent(id)}`,
      payload,
    );
  }

  /** 409 when a recorded movement references the item — the audit log wins. */
  remove(id: string): Observable<{ id: string; deleted: true }> {
    return this.http.delete<{ id: string; deleted: true }>(
      `${this.url}/${encodeURIComponent(id)}`,
    );
  }
}
