import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Item } from '../../shared/models';

@Component({
  selector: 'app-item-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorBannerComponent],
  templateUrl: './item-form.component.html',
  styleUrl: './item-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** 400 "sku already exists", surfaced against the sku control. */
  readonly skuServerError = signal<string | null>(null);

  readonly units = signal<string[]>(['each', 'box', 'bag', 'pack', 'roll', 'pallet']);

  /** Catalogue used to prefill the edit form and detect duplicate SKUs. */
  readonly items = signal<Item[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Hex Bolt M8 × 40mm', description: 'Zinc-plated, DIN 933', unit: 'box', reorderAt: 10, totalQty: 8 },
    { id: 'itm-002', sku: 'SKU-002', name: 'Nylon Washer 12mm', description: 'Natural nylon 6/6', unit: 'bag', reorderAt: 25, totalQty: 140 },
    { id: 'itm-003', sku: 'SKU-003', name: 'Steel Bracket L90', description: 'Powder-coated mild steel', unit: 'each', reorderAt: 15, totalQty: 15 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Cable Tie 200mm', description: 'UV-stable, black', unit: 'pack', reorderAt: 30, totalQty: 12 },
    { id: 'itm-005', sku: 'SKU-005', name: 'Safety Goggles', description: 'Anti-fog polycarbonate', unit: 'each', reorderAt: 20, totalQty: 64 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Nitrile Gloves M', description: 'Powder-free, 100 per box', unit: 'box', reorderAt: 40, totalQty: 96 },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap Roll', description: '500mm × 300m stretch film', unit: 'roll', reorderAt: 12, totalQty: 5 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Thermal Label Roll', description: '100mm × 150mm, 500 labels', unit: 'roll', reorderAt: 8, totalQty: 22 },
  ]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly itemId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.itemId() !== null);
  readonly existing = computed(
    () => this.items().find((i) => i.id === this.itemId()) ?? null,
  );

  readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    unit: ['each', [Validators.required]],
    reorderAt: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    effect(() => {
      const item = this.existing();
      if (item) {
        this.form.patchValue({
          sku: item.sku,
          name: item.name,
          description: item.description ?? '',
          unit: item.unit,
          reorderAt: item.reorderAt,
        });
      }
    });
  }

  get sku() {
    return this.form.controls.sku;
  }
  get name() {
    return this.form.controls.name;
  }
  get reorderAt() {
    return this.form.controls.reorderAt;
  }

  submit(): void {
    this.error.set(null);
    this.skuServerError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields and try again.');
      return;
    }

    const value = this.form.getRawValue();
    const clash = this.items().find(
      (i) =>
        i.sku.toLowerCase() === value.sku.trim().toLowerCase() &&
        i.id !== this.itemId(),
    );
    if (clash) {
      // Mirrors the API contract: Prisma P2002 maps to 400 "sku already exists".
      this.skuServerError.set('sku already exists');
      return;
    }

    this.saving.set(true);
    void this.router.navigate(['/items']);
  }

  cancel(): void {
    void this.router.navigate(this.isEdit() ? ['/items', this.itemId()] : ['/items']);
  }
}
