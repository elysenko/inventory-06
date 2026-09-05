import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE } from '../../core/api-base';
import type { Movement, MovementType, Paginated } from '../../shared/models';

export interface MovementPayload {
  type: MovementType;
  itemId: string;
  fromLocId?: string | null;
  toLocId?: string | null;
  qty: number;
  note?: string | null;
}

export interface MovementQuery {
  itemId?: string;
  type?: MovementType | '';
  /** Inclusive ISO-8601 lower bound on createdAt. */
  from?: string;
  /** Inclusive ISO-8601 upper bound on createdAt. */
  to?: string;
  page?: number;
  pageSize?: number;
}

/** The API caps pageSize at 200. */
export const MAX_PAGE_SIZE = 200;

/** REST client for /api/movements. */
@Injectable({ providedIn: 'root' })
export class MovementsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE}/movements`;

  /**
   * Records a movement. The API applies the balance change and writes the audit
   * row in one transaction, and rejects an over-draw with 400 "Insufficient
   * stock" while leaving the stored balance untouched.
   */
  create(payload: MovementPayload): Observable<Movement> {
    return this.http.post<Movement>(this.url, payload);
  }

  /** Filterable audit log. MANAGER-only: a clerk receives 403. */
  list(query: MovementQuery = {}): Observable<Paginated<Movement>> {
    let params = new HttpParams();
    if (query.itemId) {
      params = params.set('itemId', query.itemId);
    }
    if (query.type) {
      params = params.set('type', query.type);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    if (query.page) {
      params = params.set('page', String(query.page));
    }
    if (query.pageSize) {
      params = params.set('pageSize', String(query.pageSize));
    }
    return this.http.get<Paginated<Movement>>(this.url, { params });
  }
}
