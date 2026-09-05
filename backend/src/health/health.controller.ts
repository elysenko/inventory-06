import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness. Deliberately touches nothing external: a probe that fails when
   * the database blips would restart a pod that is perfectly healthy.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness. Round-trips a trivial query so a broken DSN surfaces as 503. */
  @Public()
  @Get('deep')
  @ApiOperation({ summary: 'Readiness probe — verifies database connectivity' })
  async deep(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: string; db: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch (error) {
      this.logger.error(
        'Deep health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', db: 'unreachable' };
    }
  }
}
