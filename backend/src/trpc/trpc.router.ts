import { UsersRouter } from '../users/users.router';

/**
 * Type-only surface of the composed tRPC router.
 *
 * nestjs-trpc builds the runtime router by scanning providers decorated with
 * `@Router({ alias })` — there is no root router class to declare here. The
 * library's own `AppRouterHost` service (injectable from `nestjs-trpc`) exposes
 * the generated instance when it is needed at runtime.
 *
 * This alias exists so the Angular client can import the shape as a
 * type-only import for end-to-end type safety:
 *
 *   import type { AppRouter } from '../../backend/src/trpc/trpc.router';
 *
 * Extend it whenever another `@Router`-decorated class is added.
 */
export type AppRouter = {
  users: UsersRouter;
};
