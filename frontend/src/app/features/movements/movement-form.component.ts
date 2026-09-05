import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Item, Location, MovementType, StockLevel } from '../../shared/models';

const ZONE_A: Location = { id: 'loc-a', name: 'Zone A', zone: 'A' };
const ZONE_B: Location = { id: 'loc-b', name: 'Zone B', zone: 'B' };
const ZONE_C: Location = { id: 'loc-c', name: 'Zone C', zone: 'C' };

@Component({
  selector: 'app-movement-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorBannerComponent],
  templateUrl: './movement-form.component.html',
  styleUrl: './movement-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly recordedItemId = signal<string | null>(null);
  readonly itemFilter = signal('');

  readonly types = signal<{ value: MovementType; label: string; hint: string }[]>([
    { value: 'IN', label: 'Goods in', hint: 'Receive stock into a zone' },
    { value: 'OUT', label: 'Goods out', hint: 'Issue stock from a zone' },
    { value: 'TRANSFER', label: 'Transfer', hint: 'Move stock between zones' },
  ]);

  /** GET /api/items */
  readonly items = signal<Item[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: null, unit: 'box', reorderAt: 10, totalQty: 8 },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: null, unit: 'bag', reorderAt: 25, totalQty: 140 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: null, unit: 'each', reorderAt: 15, totalQty: 15 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: null, unit: 'pack', reorderAt: 30, totalQty: 12 },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: null, unit: 'each', reorderAt: 20, totalQty: 64 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: null, unit: 'box', reorderAt: 40, totalQty: 96 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: null, unit: 'roll', reorderAt: 12, totalQty: 5 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: null, unit: 'roll', reorderAt: 8, totalQty: 22 },
  ]);

  /** GET /api/locations */
  readonly locations = signal<Location[]>([ZONE_A, ZONE_B, ZONE_C]);

  /** Per-location balances used for the source hint and the over-draw guard. */
  readonly stockLevels = signal<StockLevel[]>([
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
  ]);

  private readonly qp = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly form = this.fb.nonNullable.group({
    type: ['IN' as MovementType, [Validators.required]],
    itemId: ['', [Validators.required]],
    fromLocId: [''],
    toLocId: [''],
    qty: [1, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly type = computed(
    () => (this.formValue().type ?? 'IN') as MovementType,
  );
  readonly needsFrom = computed(() => this.type() === 'OUT' || this.type() === 'TRANSFER');
  readonly needsTo = computed(() => this.type() === 'IN' || this.type() === 'TRANSFER');

  readonly filteredItems = computed(() => {
    const term = this.itemFilter().trim().toLowerCase();
    if (!term) {
      return this.items();
    }
    return this.items().filter(
      (i) =>
        i.sku.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
    );
  });

  readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.formValue().itemId) ?? null,
  );

  /** Quantity currently held at the chosen source location. */
  readonly sourceQty = computed(() => {
    const itemId = this.formValue().itemId;
    const fromLocId = this.formValue().fromLocId;
    if (!itemId || !fromLocId) {
      return null;
    }
    const level = this.stockLevels().find(
      (l) => l.itemId === itemId && l.locationId === fromLocId,
    );
    return level ? level.qty : 0;
  });

  constructor() {
    // Prefill from ?type=&itemId=&fromLocId= so the form is deep-linkable.
    effect(() => {
      const params = this.qp();
      const type = params.get('type');
      if (type === 'IN' || type === 'OUT' || type === 'TRANSFER') {
        this.form.controls.type.setValue(type);
      }
      const itemId = params.get('itemId');
      if (itemId && this.items().some((i) => i.id === itemId)) {
        this.form.controls.itemId.setValue(itemId);
      }
      const fromLocId = params.get('fromLocId');
      if (fromLocId && this.locations().some((l) => l.id === fromLocId)) {
        this.form.controls.fromLocId.setValue(fromLocId);
      }
    });

    // Location controls enable/disable reactively with the movement type.
    effect(() => {
      const from = this.form.controls.fromLocId;
      const to = this.form.controls.toLocId;
      if (this.needsFrom()) {
        from.enable({ emitEvent: false });
      } else {
        from.disable({ emitEvent: false });
      }
      if (this.needsTo()) {
        to.enable({ emitEvent: false });
      } else {
        to.disable({ emitEvent: false });
      }
    });
  }

  get qty() {
    return this.form.controls.qty;
  }

  onFilter(event: Event): void {
    this.itemFilter.set((event.target as HTMLInputElement).value);
  }

  selectType(type: MovementType): void {
    this.form.patchValue({ type });
  }

  locationName(id: string): string {
    return this.locations().find((l) => l.id === id)?.name ?? '—';
  }

  submit(): void {
    this.error.set(null);
    this.success.set(null);

    const value = this.form.getRawValue();

    if (!value.itemId) {
      this.error.set('Choose the item being moved.');
      return;
    }
    if (this.qty.invalid) {
      this.qty.markAsTouched();
      this.error.set('Quantity must be a whole number of 1 or more.');
      return;
    }
    if (this.needsFrom() && !value.fromLocId) {
      this.error.set('Choose the source location.');
      return;
    }
    if (this.needsTo() && !value.toLocId) {
      this.error.set('Choose the destination location.');
      return;
    }
    if (this.type() === 'TRANSFER' && value.fromLocId === value.toLocId) {
      this.error.set('A transfer must move stock between two different locations.');
      return;
    }

    const available = this.sourceQty();
    if (this.needsFrom() && available !== null && value.qty > available) {
      // Mirrors the API: the guarded decrement refuses the write and the stored
      // balance is left untouched. The form keeps its values.
      this.error.set(
        `Insufficient stock — ${this.locationName(value.fromLocId)} holds ${available}, ` +
          `and this movement asks for ${value.qty}. Nothing was changed.`,
      );
      return;
    }

    const item = this.selectedItem();
    const where =
      this.type() === 'IN'
        ? `into ${this.locationName(value.toLocId)}`
        : this.type() === 'OUT'
          ? `from ${this.locationName(value.fromLocId)}`
          : `from ${this.locationName(value.fromLocId)} to ${this.locationName(value.toLocId)}`;

    this.recordedItemId.set(value.itemId);
    this.success.set(
      `Recorded ${this.type()} ${value.qty} × ${item?.sku ?? ''} ${where}.`,
    );
    this.form.patchValue({ qty: 1, note: '' });
  }
}
