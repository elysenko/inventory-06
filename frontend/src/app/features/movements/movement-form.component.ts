import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { apiMessage } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import {
  previewItems,
  previewLocations,
  previewStockLevels,
} from '../../shared/preview-data';
import type { Item, Location, MovementType, StockLevel } from '../../shared/models';
import { ItemsService } from '../items/items.service';
import { LocationsService } from '../locations/locations.service';
import { MovementPayload, MovementsService } from './movements.service';

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
  private readonly itemsApi = inject(ItemsService);
  private readonly locationsApi = inject(LocationsService);
  private readonly movementsApi = inject(MovementsService);

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
  readonly items = signal<Item[]>([]);

  /** GET /api/locations */
  readonly locations = signal<Location[]>([]);

  /**
   * Per-location balances for the selected item, from GET /api/items/:id.
   * Only the chosen item's breakdown is held: there is no bulk stock-levels
   * endpoint, and fetching the whole grid to read one cell would be wasteful.
   */
  readonly stockLevels = signal<StockLevel[]>([]);

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

  /**
   * The selected item id on its own. `formValue()` changes on every keystroke
   * in the note field; this only notifies when the item actually changes, so
   * the breakdown is refetched once per selection rather than per character.
   */
  private readonly selectedItemId = computed(() => this.formValue().itemId ?? '');

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
    if (PREVIEW_MODE) {
      this.items.set(previewItems());
      this.locations.set(previewLocations());
      this.stockLevels.set(previewStockLevels());
    } else {
      this.loadReferenceData();

      // The breakdown follows the selected item, so the source hint and the
      // over-draw check always read the balance the API currently holds.
      effect(() => {
        const itemId = this.selectedItemId();
        if (!itemId) {
          this.stockLevels.set([]);
          return;
        }
        this.itemsApi.get(itemId).subscribe({
          next: (detail) => this.stockLevels.set(detail.stockLevels),
          error: () => this.stockLevels.set([]),
        });
      });
    }

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

  private loadReferenceData(): void {
    this.itemsApi.list().subscribe({
      next: (rows) => this.items.set(rows),
      error: (err: unknown) =>
        this.error.set(apiMessage(err, 'Could not load the item catalogue.')),
    });
    this.locationsApi.list().subscribe({
      next: (rows) => this.locations.set(rows),
      error: (err: unknown) =>
        this.error.set(apiMessage(err, 'Could not load locations.')),
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

    if (PREVIEW_MODE) {
      this.announce(value.itemId, value.qty, value.fromLocId, value.toLocId);
      return;
    }

    const payload: MovementPayload = {
      type: this.type(),
      itemId: value.itemId,
      qty: Number(value.qty),
      note: value.note.trim() || null,
      fromLocId: this.needsFrom() ? value.fromLocId : null,
      toLocId: this.needsTo() ? value.toLocId : null,
    };

    this.saving.set(true);
    this.movementsApi.create(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.announce(value.itemId, value.qty, value.fromLocId, value.toLocId);
        // Balances have moved: refresh the catalogue totals and the breakdown
        // behind the source hint so a second movement is checked against the
        // new numbers rather than the ones from before this write.
        this.refreshBalances(value.itemId);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        // The API is the authority on whether the stock was there. A 400
        // "Insufficient stock" means nothing was written at all.
        this.error.set(apiMessage(err, 'Could not record this movement.'));
        this.refreshBalances(value.itemId);
      },
    });
  }

  /** Success copy, identical for the live API and the static preview. */
  private announce(
    itemId: string,
    qty: number,
    fromLocId: string,
    toLocId: string,
  ): void {
    const item = this.items().find((i) => i.id === itemId) ?? null;
    const where =
      this.type() === 'IN'
        ? `into ${this.locationName(toLocId)}`
        : this.type() === 'OUT'
          ? `from ${this.locationName(fromLocId)}`
          : `from ${this.locationName(fromLocId)} to ${this.locationName(toLocId)}`;

    this.recordedItemId.set(itemId);
    this.success.set(
      `Recorded ${this.type()} ${qty} × ${item?.sku ?? ''} ${where}.`,
    );
    this.form.patchValue({ qty: 1, note: '' });
  }

  private refreshBalances(itemId: string): void {
    this.itemsApi.list().subscribe({
      next: (rows) => this.items.set(rows),
      error: () => undefined,
    });
    this.itemsApi.get(itemId).subscribe({
      next: (detail) => this.stockLevels.set(detail.stockLevels),
      error: () => undefined,
    });
  }
}
