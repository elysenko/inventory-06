/** Domain model contracts shared by every StockRoom screen. These mirror the
 *  JSON the REST API under /api returns; dates are ISO-8601 strings. */

export type Role = 'ADMIN' | 'MANAGER' | 'CLERK' | 'USER';

export type MovementType = 'IN' | 'OUT' | 'TRANSFER';

export interface User {
  id: string;
  email: string;
  /** Display name captured at signup; shown alongside the audit trail. */
  name?: string | null;
  role: Role;
  createdAt?: string;
}

export interface Location {
  id: string;
  name: string;
  zone: string;
  createdAt?: string;
}

export interface StockLevel {
  id: string;
  itemId: string;
  locationId: string;
  qty: number;
  location: Location;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

export interface ItemDetail extends Item {
  stockLevels: StockLevel[];
}

export interface Movement {
  id: string;
  type: MovementType;
  itemId: string;
  qty: number;
  note: string | null;
  createdAt: string;
  user: { email: string; role: Role };
  item: { sku: string; name: string };
  fromLoc: Location | null;
  toLoc: Location | null;
}

export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
  deficit: number;
}

export interface SettingKey {
  key: string;
  /** Masked by the API — enough to recognise, never enough to reuse. */
  value: string;
  configured: boolean;
  /** Where the effective value came from: the pod env, the DB, or nowhere. */
  source?: 'env' | 'db' | null;
}

export interface SettingsService {
  service: string;
  label: string;
  description: string;
  configured: boolean;
  keys: SettingKey[];
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Normalised HTTP failure used for inline form errors. */
export interface ApiError {
  status: number;
  message: string;
  field?: string;
}
