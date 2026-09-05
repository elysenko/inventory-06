import { Module } from '@nestjs/common';
import { TRPCModule } from 'nestjs-trpc';
import { UsersModule } from '../users/users.module';
import { UsersRouter } from '../users/users.router';

/**
 * Wires the tRPC driver into Nest. Routers are discovered from the DI
 * container by their `@Router({ alias })` decorator, so every router class
 * must also be listed as a provider here (or exported by an imported module).
 */
@Module({
  imports: [
    TRPCModule.forRoot({
      basePath: '/trpc',
    }),
    UsersModule,
  ],
  providers: [UsersRouter],
  exports: [TRPCModule],
})
export class TrpcAppModule {}
