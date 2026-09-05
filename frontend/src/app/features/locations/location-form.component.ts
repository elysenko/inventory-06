import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { Location } from '../../shared/models';

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

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly nameServerError = signal<string | null>(null);

  /** GET /api/locations — used to prefill edit and detect a duplicate name. */
  readonly locations = signal<Location[]>([
    { id: 'loc-a', name: 'Zone A', zone: 'A', createdAt: '2026-06-01T09:00:00.000Z' },
    { id: 'loc-b', name: 'Zone B', zone: 'B', createdAt: '2026-06-01T09:02:00.000Z' },
    { id: 'loc-c', name: 'Zone C', zone: 'C', createdAt: '2026-06-01T09:04:00.000Z' },
  ]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly locationId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.locationId() !== null);
  readonly existing = computed(
    () => this.locations().find((l) => l.id === this.locationId()) ?? null,
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(64)]],
    zone: ['', [Validators.required, Validators.maxLength(16)]],
  });

  constructor() {
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
    const clash = this.locations().find(
      (l) =>
        l.name.toLowerCase() === value.name.trim().toLowerCase() &&
        l.id !== this.locationId(),
    );
    if (clash) {
      this.nameServerError.set('name already exists');
      return;
    }

    this.saving.set(true);
    void this.router.navigate(['/locations']);
  }

  cancel(): void {
    void this.router.navigate(['/locations']);
  }
}
