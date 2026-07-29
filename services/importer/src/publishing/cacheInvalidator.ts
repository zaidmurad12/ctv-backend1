import type { CacheClient } from '@ctv-platform/infrastructure';

/** Invalidates cache entries that could now be stale after a publish. */
export class CacheInvalidator {
  constructor(private readonly cache: CacheClient) {}

  invalidateMovie(movieId: string): Promise<void> {
    return this.invalidateAll([`movie:${movieId}`, 'catalog:newest']);
  }

  invalidateShow(showId: string): Promise<void> {
    return this.invalidateAll([`show:${showId}`, 'catalog:latest_shows']);
  }

  private async invalidateAll(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.cache.del(key)));
  }
}
