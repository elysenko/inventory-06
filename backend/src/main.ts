import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * CORS origins. In production the SPA is served same-origin through nginx, so
 * the list is only needed for `ng serve` and for any explicitly configured
 * front end.
 */
function corsOrigins(): string[] | boolean {
  const configured = process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN;
  if (configured && configured.trim() !== '') {
    return configured.split(',').map((origin) => origin.trim());
  }
  return process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:4200', 'http://localhost:8080'];
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  // Swagger is mounted outside the Nest router, so the global auth guard does
  // not apply — /api/docs is the platform's public backend probe path.
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('StockRoom API')
      .setDescription(
        'Warehouse inventory: item catalogue, locations, per-location stock ' +
          'levels, atomic IN/OUT/TRANSFER movements and the movement audit log.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();
  app.get(PrismaService).enableShutdownHooks(app);

  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`StockRoom API listening on :${port} (prefix /api)`);
  logger.log(`OpenAPI docs at /api/docs`);
}

void bootstrap();
