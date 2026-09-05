import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

/** Roles that satisfy a given requirement. ADMIN is a superset of MANAGER. */
const SATISFIES: Record<Role, Role[]> = {
  [Role.USER]: [Role.USER, Role.MANAGER, Role.ADMIN],
  [Role.MANAGER]: [Role.MANAGER, Role.ADMIN],
  [Role.ADMIN]: [Role.ADMIN],
};

/**
 * Global authorization guard. Handlers without `@Roles(...)` are open to any
 * authenticated principal; handlers with it require one of the listed roles
 * (or a role that subsumes it).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new ForbiddenException('Insufficient role');
    }

    const allowed = required.some((role) =>
      (SATISFIES[role] ?? [role]).includes(user.role),
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Requires role: ${required.join(' or ')}`,
      );
    }
    return true;
  }
}
