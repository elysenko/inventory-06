import { Global, Module } from '@nestjs/common';

import { ConfigResolver } from './config';

/** Makes {@link ConfigResolver} injectable everywhere without re-importing. */
@Global()
@Module({
  providers: [ConfigResolver],
  exports: [ConfigResolver],
})
export class ConfigResolverModule {}
