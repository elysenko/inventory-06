/**
 * Fixtures for the static, backend-less preview bundle only.
 *
 * Every export here is reachable exclusively from a `PREVIEW_MODE ? … : …`
 * branch, so the production build — where `COLOSSUS_PREVIEW` is defined as
 * `false` — constant-folds those branches away and drops this module from the
 * shipped bundle. Nothing in the live app reads these values; the real screens
 * are populated from the REST API.
 */
import type {
  Item,
  ItemDetail,
  Location,
  LowStockRow,
  Movement,
  SettingsService,
  StockLevel,
} from './models';

export const ZONE_A: Location = { id: 'loc-a', name: 'Zone A', zone: 'A', createdAt: '2026-06-01T09:00:00.000Z' };
export const ZONE_B: Location = { id: 'loc-b', name: 'Zone B', zone: 'B', createdAt: '2026-06-01T09:02:00.000Z' };
export const ZONE_C: Location = { id: 'loc-c', name: 'Zone C', zone: 'C', createdAt: '2026-06-01T09:04:00.000Z' };

const CLERK = { email: 'preview.clerk@stockroom.local', role: 'CLERK' as const };
const MANAGER = { email: 'preview.manager@stockroom.local', role: 'MANAGER' as const };

export function previewLocations(): Location[] {
  return [ZONE_A, ZONE_B, ZONE_C];
}

export function previewItems(): Item[] {
  return [
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: 'Zinc-plated, DIN 933', unit: 'box', reorderAt: 10, totalQty: 8 },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: 'Natural nylon 6/6', unit: 'bag', reorderAt: 25, totalQty: 140 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: 'Powder-coated mild steel', unit: 'each', reorderAt: 15, totalQty: 15 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: 'UV-stable, black', unit: 'pack', reorderAt: 30, totalQty: 12 },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: 'Anti-fog polycarbonate', unit: 'each', reorderAt: 20, totalQty: 64 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: 'Powder-free, 100 per box', unit: 'box', reorderAt: 40, totalQty: 96 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: '500mm × 300m stretch film', unit: 'roll', reorderAt: 12, totalQty: 5 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: '100mm × 150mm, 500 labels', unit: 'roll', reorderAt: 8, totalQty: 22 },
  ];
}

export function previewStockLevels(): StockLevel[] {
  return [
    { id: 'sl-1', itemId: 'itm-001', locationId: 'loc-a', qty: 5, location: ZONE_A },
    { id: 'sl-2', itemId: 'itm-001', locationId: 'loc-b', qty: 3, location: ZONE_B },
    { id: 'sl-3', itemId: 'itm-002', locationId: 'loc-a', qty: 90, location: ZONE_A },
    { id: 'sl-4', itemId: 'itm-002', locationId: 'loc-c', qty: 50, location: ZONE_C },
    { id: 'sl-5', itemId: 'itm-003', locationId: 'loc-b', qty: 15, location: ZONE_B },
    { id: 'sl-6', itemId: 'itm-004', locationId: 'loc-a', qty: 4, location: ZONE_A },
    { id: 'sl-7', itemId: 'itm-004', locationId: 'loc-b', qty: 8, location: ZONE_B },
    { id: 'sl-8', itemId: 'itm-005', locationId: 'loc-a', qty: 64, location: ZONE_A },
    { id: 'sl-9', itemId: 'itm-006', locationId: 'loc-b', qty: 60, location: ZONE_B },
    { id: 'sl-10', itemId: 'itm-006', locationId: 'loc-c', qty: 36, location: ZONE_C },
    { id: 'sl-11', itemId: 'itm-007', locationId: 'loc-c', qty: 5, location: ZONE_C },
    { id: 'sl-12', itemId: 'itm-008', locationId: 'loc-a', qty: 10, location: ZONE_A },
    { id: 'sl-13', itemId: 'itm-008', locationId: 'loc-c', qty: 12, location: ZONE_C },
  ];
}

/** The catalogue joined to its per-location breakdown, as GET /api/items/:id returns it. */
export function previewItemDetails(): ItemDetail[] {
  const levels = previewStockLevels();
  return previewItems().map((item) => ({
    ...item,
    stockLevels: levels.filter((level) => level.itemId === item.id),
  }));
}

export function previewMovements(): Movement[] {
  return [
    { id: 'mv-01', type: 'OUT', itemId: 'itm-001', qty: 4, note: 'Line 3 rebuild', createdAt: '2026-09-04T14:32:00.000Z', user: CLERK, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: null },
    { id: 'mv-02', type: 'TRANSFER', itemId: 'itm-001', qty: 3, note: 'Rebalance to picking face', createdAt: '2026-09-03T09:15:00.000Z', user: MANAGER, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: ZONE_A, toLoc: ZONE_B },
    { id: 'mv-03', type: 'IN', itemId: 'itm-001', qty: 15, note: 'PO-4417 receipt', createdAt: '2026-09-01T08:02:00.000Z', user: CLERK, item: { sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-04', type: 'IN', itemId: 'itm-002', qty: 90, note: 'PO-4418 receipt', createdAt: '2026-08-31T11:40:00.000Z', user: CLERK, item: { sku: 'SKU-002', name: 'Nylon Washer 12mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-05', type: 'OUT', itemId: 'itm-004', qty: 18, note: 'Harness kitting', createdAt: '2026-08-30T16:05:00.000Z', user: CLERK, item: { sku: 'SKU-004', name: 'Cable Tie 200mm' }, fromLoc: ZONE_B, toLoc: null },
    { id: 'mv-06', type: 'TRANSFER', itemId: 'itm-008', qty: 12, note: null, createdAt: '2026-08-29T13:20:00.000Z', user: MANAGER, item: { sku: 'SKU-008', name: 'Thermal Label Roll' }, fromLoc: ZONE_A, toLoc: ZONE_C },
    { id: 'mv-07', type: 'OUT', itemId: 'itm-007', qty: 7, note: 'Outbound wrapping', createdAt: '2026-08-28T07:55:00.000Z', user: CLERK, item: { sku: 'SKU-007', name: 'Pallet Wrap Roll' }, fromLoc: ZONE_C, toLoc: null },
    { id: 'mv-08', type: 'IN', itemId: 'itm-006', qty: 96, note: 'Quarterly PPE order', createdAt: '2026-08-26T10:10:00.000Z', user: MANAGER, item: { sku: 'SKU-006', name: 'Nitrile Gloves M' }, fromLoc: null, toLoc: ZONE_B },
    { id: 'mv-09', type: 'TRANSFER', itemId: 'itm-006', qty: 36, note: 'Overflow to Zone C', createdAt: '2026-08-25T15:48:00.000Z', user: MANAGER, item: { sku: 'SKU-006', name: 'Nitrile Gloves M' }, fromLoc: ZONE_B, toLoc: ZONE_C },
    { id: 'mv-10', type: 'IN', itemId: 'itm-005', qty: 64, note: 'PO-4402 receipt', createdAt: '2026-08-24T09:30:00.000Z', user: CLERK, item: { sku: 'SKU-005', name: 'Safety Goggles' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-11', type: 'IN', itemId: 'itm-003', qty: 15, note: 'PO-4399 receipt', createdAt: '2026-08-22T12:05:00.000Z', user: CLERK, item: { sku: 'SKU-003', name: 'Steel Bracket L90' }, fromLoc: null, toLoc: ZONE_B },
    { id: 'mv-12', type: 'IN', itemId: 'itm-004', qty: 30, note: 'PO-4398 receipt', createdAt: '2026-08-21T08:44:00.000Z', user: CLERK, item: { sku: 'SKU-004', name: 'Cable Tie 200mm' }, fromLoc: null, toLoc: ZONE_A },
    { id: 'mv-13', type: 'IN', itemId: 'itm-002', qty: 50, note: 'PO-4397 receipt', createdAt: '2026-08-20T10:12:00.000Z', user: MANAGER, item: { sku: 'SKU-002', name: 'Nylon Washer 12mm' }, fromLoc: null, toLoc: ZONE_C },
    { id: 'mv-14', type: 'IN', itemId: 'itm-007', qty: 12, note: 'PO-4396 receipt', createdAt: '2026-08-19T14:26:00.000Z', user: CLERK, item: { sku: 'SKU-007', name: 'Pallet Wrap Roll' }, fromLoc: null, toLoc: ZONE_C },
    { id: 'mv-15', type: 'IN', itemId: 'itm-008', qty: 22, note: 'PO-4395 receipt', createdAt: '2026-08-18T11:03:00.000Z', user: MANAGER, item: { sku: 'SKU-008', name: 'Thermal Label Roll' }, fromLoc: null, toLoc: ZONE_A },
  ];
}

export function previewLowStock(): LowStockRow[] {
  return [
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', unit: 'pack', reorderAt: 30, totalQty: 12, deficit: 18 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', unit: 'roll', reorderAt: 12, totalQty: 5, deficit: 7 },
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', unit: 'box', reorderAt: 10, totalQty: 8, deficit: 2 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', unit: 'each', reorderAt: 15, totalQty: 15, deficit: 0 },
  ];
}

export function previewSettings(): SettingsService[] {
  return [
    {
      service: 'postgresql',
      label: 'PostgreSQL',
      description: 'Primary datastore for items, locations, stock levels and the movement audit log.',
      configured: true,
      keys: [
        { key: 'DATABASE_URL', value: 'postgresql://stockroom:••••••••@db:5432/stockroom', configured: true, source: 'env' },
      ],
    },
    {
      service: 'minio',
      label: 'MinIO object storage',
      description: 'Object storage for document and label attachments. Not yet activated.',
      configured: false,
      keys: [
        { key: 'MINIO_ENDPOINT', value: '', configured: false, source: null },
        { key: 'MINIO_ACCESS_KEY', value: '', configured: false, source: null },
        { key: 'MINIO_SECRET_KEY', value: '', configured: false, source: null },
        { key: 'MINIO_BUCKET', value: '', configured: false, source: null },
      ],
    },
  ];
}
