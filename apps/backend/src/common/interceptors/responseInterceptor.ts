import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccessResponse } from '../responses/apiResponse.js';
import { successResponse } from '../responses/apiResponse.js';

export interface Paginated<T> {
  readonly items: T;
  readonly meta: Record<string, unknown>;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return typeof value === 'object' && value !== null && 'items' in value && 'meta' in value;
}

/** Wraps every controller return value in the standard `{ success, data, meta }` envelope. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(
      map((payload) => {
        if (isPaginated<T>(payload)) {
          return successResponse(payload.items, payload.meta);
        }
        return successResponse(payload);
      }),
    );
  }
}
