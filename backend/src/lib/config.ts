import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ServiceUnconfiguredError } from '../common/errors/service-unconfigured.error';

/** Written by the settings screen for a key an operator has not filled in yet. */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/** A value is "set" only when it is non-empty and not the placeholder. */
export function isConfiguredValue(value: string | null | undefined): boolean {
  return !!value && value.trim() !== '' && value !== PLACEHOLDER;
}

/**
 * Resolves service credentials with a fixed priority:
 *   1. the process environment (mounted from the platform secret at deploy time)
 *   2. the `SystemSetting` row an admin saved through Admin > Settings
 *   3. `null` — the feature is unconfigured and its callers must degrade
 *
 * Nothing here throws on a missing key: a third-party credential that was never
 * provisioned degrades the one feature that needs it, it never fails startup.
 */
@Injectable()
export class ConfigResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(key: string): Promise<string | null> {
    const fromEnv = process.env[key];
    if (isConfiguredValue(fromEnv)) {
      return fromEnv as string;
    }

    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return isConfiguredValue(row?.value) ? (row as { value: string }).value : null;
  }

  /** Resolves several keys at once, preserving the requested order. */
  async resolveAll(keys: string[]): Promise<Record<string, string | null>> {
    const entries = await Promise.all(
      keys.map(async (key) => [key, await this.resolve(key)] as const),
    );
    return Object.fromEntries(entries);
  }

  async isConfigured(keys: string[]): Promise<boolean> {
    const resolved = await this.resolveAll(keys);
    return keys.every((key) => resolved[key] !== null);
  }

  /**
   * Resolves every key or throws {@link ServiceUnconfiguredError} (HTTP 503).
   * Call this at the point of use, never at startup.
   */
  async require(
    service: string,
    keys: string[],
  ): Promise<Record<string, string>> {
    const resolved = await this.resolveAll(keys);
    const missing = keys.filter((key) => resolved[key] === null);
    if (missing.length > 0) {
      throw new ServiceUnconfiguredError(service, missing);
    }
    return resolved as Record<string, string>;
  }
}
