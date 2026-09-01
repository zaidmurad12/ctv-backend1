import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError } from '@ctv-platform/domain';
import type { Request, Response } from 'express';
import { errorResponse } from '../responses/apiResponse.js';

interface ClassifiedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

/**
 * Converts every thrown error into the standard envelope from
 * specification/09-Backend-API.md.txt, and per
 * specification/12-Security.md.txt ("Error Handling: Never expose Stack
 * Traces, Internal Errors, Database Details, Server Paths"), never leaks
 * anything beyond a safe message for unexpected failures.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const classified = this.classify(exception);
    if (classified.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${classified.status}`,
        (exception as Error)?.stack,
      );
    }

    response
      .status(classified.status)
      .json(errorResponse(classified.code, classified.message, classified.details));
  }

  private classify(exception: unknown): ClassifiedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
        details: typeof body === 'object' ? (body as { details?: unknown }).details : undefined,
      };
    }

    if (exception instanceof NotFoundError) {
      return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: exception.message };
    }
    if (exception instanceof ConflictError) {
      return { status: HttpStatus.CONFLICT, code: 'CONFLICT', message: exception.message };
    }
    if (exception instanceof ValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'VALIDATION_ERROR',
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    };
  }
}
