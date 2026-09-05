import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy, jwtSecret } from './jwt.strategy';

/**
 * `expiresIn` is typed as a `ms` duration literal, so an env-provided string
 * has to be re-asserted. Invalid values fail loudly at first sign-in rather
 * than silently minting non-expiring tokens.
 */
type ExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];
const EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '24h') as ExpiresIn;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: {
        algorithm: 'HS256',
        expiresIn: EXPIRES_IN,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
