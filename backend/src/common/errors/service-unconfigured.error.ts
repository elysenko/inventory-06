/**
 * Raised when a third-party integration is invoked but its credentials were
 * never provisioned. The platform provisions only app-owned config
 * (DATABASE_URL, JWT_SECRET); every other key is optional, so a missing one
 * must degrade the single feature that needs it rather than crash the pod.
 *
 * Mapped to HTTP 503 by {@link PrismaExceptionFilter}.
 */
export class ServiceUnconfiguredError extends Error {
  readonly service: string;
  readonly missingKeys: string[];

  constructor(service: string, missingKeys: string[]) {
    super(
      `${service} is not configured — set ${missingKeys.join(', ')} in Admin > Settings`,
    );
    this.name = 'ServiceUnconfiguredError';
    this.service = service;
    this.missingKeys = missingKeys;
  }
}
