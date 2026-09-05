import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** The authenticated principal attached to the request by {@link JwtStrategy}. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

/** Injects the authenticated principal into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    return request.user as AuthUser;
  },
);
