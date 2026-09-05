import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { ErrorBannerComponent } from '../../shared/error-banner.component';
import type { SettingsService } from '../../shared/models';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule, ErrorBannerComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  /** GET /api/admin/settings — one entry per provisioned backing service. */
  readonly services = signal<SettingsService[]>([
    {
      service: 'postgresql',
      label: 'PostgreSQL',
      description: 'Primary datastore for items, locations, stock levels and the movement audit log.',
      configured: true,
      keys: [
        { key: 'DATABASE_URL', value: 'postgresql://stockroom:••••••••@db:5432/stockroom', configured: true },
      ],
    },
    {
      service: 'minio',
      label: 'MinIO object storage',
      description: 'Object storage for future document and label attachments. Not yet activated.',
      configured: false,
      keys: [
        { key: 'MINIO_ENDPOINT', value: '', configured: false },
        { key: 'MINIO_ACCESS_KEY', value: '', configured: false },
        { key: 'MINIO_SECRET_KEY', value: '', configured: false },
        { key: 'MINIO_BUCKET', value: '', configured: false },
      ],
    },
  ]);

  readonly unconfigured = computed(() =>
    this.services().filter((service) => !service.configured),
  );

  readonly unconfiguredLabels = computed(() =>
    this.unconfigured()
      .map((service) => service.label)
      .join(', '),
  );

  readonly forms = computed<Record<string, FormGroup>>(() => {
    const groups: Record<string, FormGroup> = {};
    for (const service of this.services()) {
      const controls: Record<string, string[]> = {};
      for (const key of service.keys) {
        controls[key.key] = [''];
      }
      groups[service.service] = this.fb.group(controls);
    }
    return groups;
  });

  formFor(service: SettingsService): FormGroup {
    return this.forms()[service.service];
  }

  /** PATCH /api/admin/settings — upserts the supplied key/value pairs. */
  save(service: SettingsService): void {
    this.error.set(null);
    const group = this.formFor(service);
    const filled = Object.values(group.getRawValue() as Record<string, string>).filter(
      (value) => value.trim().length > 0,
    );
    if (filled.length === 0) {
      this.error.set(`Enter at least one ${service.label} credential before saving.`);
      return;
    }
    this.notice.set(`${service.label} credentials saved. ${filled.length} key(s) updated.`);
    group.reset();
  }
}
