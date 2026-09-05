import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { ServiceUnconfiguredError } from '../errors/service-unconfigured.error';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  field?: string;
  path: string;
}

/**
 * Nest's own reason phrase for a status, e.g. 400 -> "Bad Request". Derived
 * from the enum name so a hand-built body and a framework-built one read the
 * same to the client.
 */
function reasonPhrase(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') {
    return 'Error';
  }
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Reads the offending column(s) out of a P2002 unique-constraint failure. */
function uniqueTarget(meta: unknown): string | undefined {
  const target = (meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.map(String).join(', ');
  }
  if (typeof target === 'string') {
    return target;
  }
  return undefined;
}

/**
 * Translates every uncaught error into the JSON error contract the Angular
 * client expects: `{ statusCode, message, error, field? }`.
 *
 * Prisma mappings: P2002 -> 400 "<field> already exists", P2025 -> 404,
 * P2003 -> 409. A {@link ServiceUnconfiguredError} becomes 503.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);
    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        return {
          error: reasonPhrase(status),
          ...(payload as Record<string, unknown>),
          statusCode: status,
          path,
        } as ErrorBody;
      }
      return {
        statusCode: status,
        message: String(payload),
        error: reasonPhrase(status),
        path,
      };
    }

    if (exception instanceof ServiceUnconfiguredError) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: exception.message,
        error: 'ServiceUnconfiguredError',
        path,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const field = uniqueTarget(exception.meta);
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: field
              ? `${field} already exists`
              : 'Value already exists',
            error: 'Bad Request',
            ...(field ? { field } : {}),
            path,
          };
        }
        case 'P2025':
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Record not found',
            error: 'Not Found',
            path,
          };
        case 'P2003':
          return {
            statusCode: HttpStatus.CONFLICT,
            message: 'Record is referenced by other records',
            error: 'Conflict',
            path,
          };
        default:
          break;
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid query',
        error: 'Bad Request',
        path,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      path,
    };
  }
}
