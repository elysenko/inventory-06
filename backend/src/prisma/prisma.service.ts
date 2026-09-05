import {
  Injectable,
  INestApplication,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Closes the Nest application when the process is asked to exit, so
   * in-flight requests finish and the pool is released.
   *
   * Prisma's library engine no longer emits a `beforeExit` event, so this
   * listens on the process instead.
   */
  enableShutdownHooks(app: INestApplication): void {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void app.close();
      });
    }
  }
}
