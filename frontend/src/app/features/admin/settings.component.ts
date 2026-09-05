import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { apiMessage } from '../../core/api-error';
import { PREVIEW_MODE } from '../../core/preview-flag';
import { ErrorBannerComponent } from '../../shared/error-banner.component';
import { previewSettings } from '../../shared/preview-data';
import type { SettingsService } from '../../shared/models';
import { AdminSettingsApiService, SettingEntry } from './admin-settings.service';

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
  private readonly api = inject(AdminSettingsApiService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  /** GET /api/admin/settings — one entry per provisioned backing service. */
  readonly services = signal<SettingsService[]>([]);

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

  constructor() {
    if (PREVIEW_MODE) {
      this.services.set(previewSettings());
      return;
    }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (services) => {
        this.services.set(services);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiMessage(err, 'Could not load service settings.'));
        this.loading.set(false);
      },
    });
  }

  formFor(service: SettingsService): FormGroup {
    return this.forms()[service.service];
  }

  /** PATCH /api/admin/settings — upserts the supplied key/value pairs. */
  save(service: SettingsService): void {
    this.error.set(null);
    this.notice.set(null);

    const group = this.formFor(service);
    const raw = group.getRawValue() as Record<string, string>;
    // Blank means "leave it as it is" — only non-empty fields are written, so
    // saving one key never clears the others.
    const entries: SettingEntry[] = Object.entries(raw)
      .filter(([, value]) => value.trim().length > 0)
      .map(([key, value]) => ({ key, value: value.trim() }));

    if (entries.length === 0) {
      this.error.set(`Enter at least one ${service.label} credential before saving.`);
      return;
    }

    if (PREVIEW_MODE) {
      this.notice.set(
        `${service.label} credentials saved. ${entries.length} key(s) updated.`,
      );
      group.reset();
      return;
    }

    this.api.update(entries).subscribe({
      next: (services) => {
        // The response is the re-read, re-masked status for every service, so
        // the "Configured" badges reflect what the API can actually resolve.
        this.services.set(services);
        this.notice.set(
          `${service.label} credentials saved. ${entries.length} key(s) updated.`,
        );
      },
      error: (err: unknown) =>
        this.error.set(
          apiMessage(err, `Could not save ${service.label} credentials.`),
        ),
    });
  }
}
