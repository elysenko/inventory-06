import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_BASE } from '../../core/api-base';
import type { LowStockRow } from '../../shared/models';

/** REST client for /api/reports. MANAGER-only. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);

  /** Items where totalQty <= reorderAt, worst shortfall first. */
  lowStock(): Observable<LowStockRow[]> {
    return this.http.get<LowStockRow[]>(`${API_BASE}/reports/low-stock`);
  }
}
