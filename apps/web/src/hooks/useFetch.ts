import { useCallback, useEffect, useState } from 'react';

interface FetchState<T> {
  readonly data: T | undefined;
  readonly isLoading: boolean;
  readonly error: Error | undefined;
  readonly refetch: () => Promise<void>;
}

/**
 * Tiny data-fetching hook: re-runs `loader` whenever `deps` change, or on demand via `refetch`.
 *
 * `enabled` (default true) gates the actual request — pass `Boolean(user)` on auth-gated pages
 * so the fetch waits for a real session instead of firing once unauthenticated (wasted 401
 * round-trip during the pre-redirect flash) and again right after login.
 */
export function useFetch<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): FetchState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | undefined>(undefined);

  const run = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(undefined);
    try {
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return { data, isLoading, error, refetch: run };
}
