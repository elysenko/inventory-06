import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { toApiError } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewItems } from '../../shared/preview-data';
import type { Item } from '../../shared/models';
import { ItemPayload, ItemsService } from './items.service';

const BASE_UNITS = ['each', 'box', 'bag', 'pack', 'roll', 'pallet'];

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
  private readonly api = inject(ItemsService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** 400 "sku already exists", surfaced against the sku control. */
  readonly skuServerError = signal<string | null>(null);

  /** The item being edited, loaded from GET /api/items/:id. */
  readonly existing = signal<Item | null>(null);

  /**
   * A stock unit the catalogue already uses but that is not one of the
   * built-in options would otherwise render as a blank select on edit.
   */
  readonly units = computed(() => {
    const unit = this.existing()?.unit;
    return unit && !BASE_UNITS.includes(unit) ? [...BASE_UNITS, unit] : BASE_UNITS;
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly itemId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.itemId() !== null);

  readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    unit: ['each', [Validators.required]],
    reorderAt: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    effect(() => {
      const id = this.itemId();
      if (!id) {
        this.existing.set(null);
        return;
      }
      if (PREVIEW_MODE) {
        this.existing.set(previewItems().find((i) => i.id === id) ?? null);
        return;
      }
      this.api.get(id).subscribe({
        next: (item) => this.existing.set(item),
        error: (err: unknown) =>
          this.error.set(toApiError(err, 'Could not load this item.').message),
      });
    });

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
    const payload: ItemPayload = {
      sku: value.sku.trim(),
      name: value.name.trim(),
      description: value.description.trim() || null,
      unit: value.unit,
      reorderAt: Number(value.reorderAt),
    };

    if (PREVIEW_MODE) {
      const clash = previewItems().find(
        (i) =>
          i.sku.toLowerCase() === payload.sku.toLowerCase() &&
          i.id !== this.itemId(),
      );
      if (clash) {
        // Mirrors the API contract: Prisma P2002 maps to 400 "sku already exists".
        this.skuServerError.set('sku already exists');
        return;
      }
      this.saving.set(true);
      void this.router.navigate(['/items']);
      return;
    }

    this.saving.set(true);
    const id = this.itemId();
    const request = id
      ? this.api.update(id, payload)
      : this.api.create(payload);

    request.subscribe({
      next: (item) => void this.router.navigate(['/items', item.id]),
      error: (err: unknown) => {
        this.saving.set(false);
        const failure = toApiError(err, 'Could not save this item.');
        // The API tags a unique-constraint failure with the offending column,
        // so a duplicate SKU lands on the sku control rather than the banner.
        if (
          failure.status === 400 &&
          (failure.field === 'sku' || /sku/i.test(failure.message))
        ) {
          this.skuServerError.set(failure.message);
          return;
        }
        this.error.set(failure.message);
      },
    });
  }

  cancel(): void {
    void this.router.navigate(this.isEdit() ? ['/items', this.itemId()] : ['/items']);
  }
}
