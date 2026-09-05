import { HttpErrorResponse } from '@angular/common/http';

import type { ApiError } from '../shared/models';

/** The JSON error contract every API route returns via PrismaExceptionFilter. */
interface ErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  field?: string;
}

/**
 * Normalises anything HttpClient can hand back into an {@link ApiError}.
 *
 * `message` arrives as a string for hand-thrown exceptions and as a string[]
 * from the global ValidationPipe, so both shapes are flattened here rather than
 * in each of the dozen call sites that surface a failure.
 */
export function toApiError(error: unknown, fallback: string): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, message: fallback };
  }

  // status 0 means the request never reached the API at all.
  if (error.status === 0) {
    return {
      status: 0,
      message: 'Cannot reach the StockRoom API. Check your connection and try again.',
    };
  }

  const body = (error.error ?? {}) as ErrorBody;
  const raw = body.message;
  const message = Array.isArray(raw)
    ? raw.join(' ')
    : typeof raw === 'string' && raw.trim() !== ''
      ? raw
      : fallback;

  return { status: error.status, message, field: body.field };
}

/** Convenience for the common `error.set(...)` case. */
export function apiMessage(error: unknown, fallback: string): string {
  return toApiError(error, fallback).message;
}
