import { SetMetadata, CustomDecorator } from '@nestjs/common';

/** Metadata key read by {@link JwtAuthGuard} to skip authentication. */
export const IS_PUBLIC_KEY = 'colossus:isPublic';

/**
 * Marks a route (or a whole controller) as reachable without a bearer token.
 * Only `/health`, `/health/deep`, `/auth/login` and `/auth/signup` use it.
 */
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);
