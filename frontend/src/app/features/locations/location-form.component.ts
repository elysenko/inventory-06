import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { toApiError } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewLocations } from '../../shared/preview-data';
import type { Location } from '../../shared/models';
import { LocationsService } from './locations.service';

@Component({
  selector: 'app-location-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorBannerComponent],
  templateUrl: './location-form.component.html',
  styleUrl: './location-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(LocationsService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly nameServerError = signal<string | null>(null);

  /** GET /api/locations/:id — used to prefill the edit form. */
  readonly existing = signal<Location | null>(null);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly locationId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.locationId() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(64)]],
    zone: ['', [Validators.required, Validators.maxLength(16)]],
  });

  constructor() {
    effect(() => {
      const id = this.locationId();
      if (!id) {
        this.existing.set(null);
        return;
      }
      if (PREVIEW_MODE) {
        this.existing.set(previewLocations().find((l) => l.id === id) ?? null);
        return;
      }
      this.api.get(id).subscribe({
        next: (location) => this.existing.set(location),
        error: (err: unknown) =>
          this.error.set(toApiError(err, 'Could not load this location.').message),
      });
    });

    effect(() => {
      const location = this.existing();
      if (location) {
        this.form.patchValue({ name: location.name, zone: location.zone });
      }
    });
  }

  get name() {
    return this.form.controls.name;
  }
  get zone() {
    return this.form.controls.zone;
  }

  submit(): void {
    this.error.set(null);
    this.nameServerError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields and try again.');
      return;
    }

    const value = this.form.getRawValue();
    const payload = { name: value.name.trim(), zone: value.zone.trim() };

    if (PREVIEW_MODE) {
      const clash = previewLocations().find(
        (l) =>
          l.name.toLowerCase() === payload.name.toLowerCase() &&
          l.id !== this.locationId(),
      );
      if (clash) {
        this.nameServerError.set('name already exists');
        return;
      }
      this.saving.set(true);
      void this.router.navigate(['/locations']);
      return;
    }

    this.saving.set(true);
    const id = this.locationId();
    const request = id ? this.api.update(id, payload) : this.api.create(payload);

    request.subscribe({
      next: () => void this.router.navigate(['/locations']),
      error: (err: unknown) => {
        this.saving.set(false);
        const failure = toApiError(err, 'Could not save this location.');
        // P2002 on Location.name maps to 400 "name already exists".
        if (
          failure.status === 400 &&
          (failure.field === 'name' || /name/i.test(failure.message))
        ) {
          this.nameServerError.set(failure.message);
          return;
        }
        this.error.set(failure.message);
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/locations']);
  }
}
