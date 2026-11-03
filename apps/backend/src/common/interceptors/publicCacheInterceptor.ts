import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable, UseInterceptors } from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 1000;

// Keyed by the full request URL (path + query). A Map keeps insertion order, so the first key is
// always the oldest - evicted once the cache is full.
const cache = new Map<string, { expires: number; value: unknown }>();

/**
 * Short in-memory cache for public, non-personal catalog reads (details, lists, home rows). The
 * database is a remote round trip away, and a details page cost several of them - 2-3s per request
 * measured from the app's side for /shows/:id, /movies/:id and the lists, every single time. The
 * catalog only changes on the nightly/3-hourly imports and admin edits, so serving a result up to
 * TTL_MS old is harmless, and repeat opens of the same title or row come back immediately.
 * Only for endpoints whose response doesn't depend on who's asking.
 */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; originalUrl?: string; url: string }>();
    if (req.method !== 'GET') return next.handle();
    const key = req.originalUrl ?? req.url;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return of(hit.value);
    return next.handle().pipe(
      tap((value) => {
        cache.delete(key);
        cache.set(key, { expires: now + TTL_MS, value });
        if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      }),
    );
  }
}

export const PublicCache = () => UseInterceptors(PublicCacheInterceptor);
