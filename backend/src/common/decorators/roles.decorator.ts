import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Metadata key read by {@link RolesGuard}. */
export const ROLES_KEY = 'colossus:roles';

/**
 * Restricts a handler to the listed roles. `ADMIN` implicitly satisfies a
 * `MANAGER` requirement — see {@link RolesGuard} — so manager-only screens do
 * not have to enumerate both.
 */
export const Roles = (...roles: Role[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
