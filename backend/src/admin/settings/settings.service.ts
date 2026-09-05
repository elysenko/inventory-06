import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ConfigResolver, isConfiguredValue } from '../../lib/config';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** One credential and whether it currently resolves to a real value. */
export interface SettingKeyView {
  key: string;
  /** Masked — enough to recognise the value, never enough to reuse it. */
  value: string;
  configured: boolean;
  /** Where the effective value came from: the pod env, the DB, or nowhere. */
  source: 'env' | 'db' | null;
}

export interface SettingsServiceView {
  service: string;
  label: string;
  description: string;
  configured: boolean;
  keys: SettingKeyView[];
}

interface ServiceSpec {
  service: string;
  label: string;
  description: string;
  keys: string[];
}

/**
 * The backing services this app knows how to talk to. `postgresql` is
 * app-owned and always provisioned; everything else is optional and its
 * absence must degrade only the feature that needs it.
 */
const SERVICES: ServiceSpec[] = [
  {
    service: 'postgresql',
    label: 'PostgreSQL',
    description:
      'Primary datastore for items, locations, stock levels and the movement audit log.',
    keys: ['DATABASE_URL'],
  },
  {
    service: 'minio',
    label: 'MinIO object storage',
    description:
      'Object storage for document and label attachments. Not yet activated.',
    keys: [
      'MINIO_ENDPOINT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'MINIO_BUCKET',
    ],
  },
];

/** Every key an operator is allowed to write through this endpoint. */
const WRITABLE_KEYS = new Set(SERVICES.flatMap((service) => service.keys));

/**
 * Masks a credential for display: keeps a short recognisable prefix and the
 * final characters, replaces the middle. Short values are fully masked.
 */
export function maskValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return '•'.repeat(Math.max(trimmed.length, 4));
  }
  const scheme = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\//i)?.[0] ?? '';
  const body = trimmed.slice(scheme.length);
  const head = body.slice(0, 4);
  const tail = body.slice(-4);
  return `${scheme}${head}${'•'.repeat(8)}${tail}`;
}

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigResolver,
  ) {}

  /** Per-service credential status with masked values. */
  async list(): Promise<SettingsServiceView[]> {
    return Promise.all(
      SERVICES.map(async (spec) => {
        const keys: SettingKeyView[] = await Promise.all(
          spec.keys.map(async (key) => {
            const resolved = await this.config.resolve(key);
            // The resolver prefers the environment, so a value that matches
            // the env var came from there; anything else came from the DB.
            const source: SettingKeyView['source'] =
              resolved === null
                ? null
                : isConfiguredValue(process.env[key])
                  ? 'env'
                  : 'db';
            return {
              key,
              value: resolved === null ? '' : maskValue(resolved),
              configured: resolved !== null,
              source,
            };
          }),
        );

        return {
          service: spec.service,
          label: spec.label,
          description: spec.description,
          configured: keys.every((key) => key.configured),
          keys,
        };
      }),
    );
  }

  /**
   * Upserts operator-supplied credentials. Only keys this app declares are
   * accepted, so the endpoint cannot be used to write arbitrary rows.
   */
  async update(dto: UpdateSettingsDto): Promise<SettingsServiceView[]> {
    const unknown = dto.entries
      .map((entry) => entry.key)
      .filter((key) => !WRITABLE_KEYS.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown setting key(s): ${unknown.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.systemSetting.upsert({
          where: { key: entry.key },
          update: { value: entry.value },
          create: { key: entry.key, value: entry.value },
        }),
      ),
    );

    return this.list();
  }
}
