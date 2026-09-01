export type ConsumetHttpErrorKind = 'timeout' | 'network' | 'http';

/** A typed transport failure; the provider layer maps this to a `ProviderErrorCodeEnum`. */
export class ConsumetHttpError extends Error {
  readonly kind: ConsumetHttpErrorKind;
  readonly status: number | null;

  constructor(kind: ConsumetHttpErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ConsumetHttpError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ConsumetHttpClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly userAgent?: string;
  /** Raw-response cache TTL, per specification/05-Provider-Architecture.md.txt "Providers may cache raw responses." */
  readonly cacheTtlSeconds?: number;
  readonly fetchImpl?: typeof fetch;
}

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

/**
 * Thin fetch wrapper around a self-hosted Consumet API instance. Carries no
 * retry/rate-limit logic of its own — `AbstractProvider` (from
 * `@ctv-platform/sdk`) already owns that uniformly for every provider. This
 * client's only extra responsibility is the raw-response cache, kept
 * in-process and private to this package so it never leaks into the host
 * application.
 */
export class ConsumetHttpClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ConsumetHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = this.buildUrl(path, params);
    const cached = this.readCache<T>(url);
    if (cached !== undefined) {
      return cached;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(this.options.userAgent ? { 'User-Agent': this.options.userAgent } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConsumetHttpError('timeout', `Request to "${url}" timed out.`);
      }
      throw new ConsumetHttpError(
        'network',
        error instanceof Error ? error.message : `Network error requesting "${url}".`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ConsumetHttpError(
        'http',
        `Consumet request to "${url}" failed with status ${response.status}.`,
        response.status,
      );
    }

    const body = (await response.json()) as T;
    this.writeCache(url, body);
    return body;
  }

  private buildUrl(path: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(path.replace(/^\//, ''), `${this.options.baseUrl.replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private readCache<T>(url: string): T | undefined {
    const entry = this.cache.get(url);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(url);
      return undefined;
    }
    return entry.value as T;
  }

  private writeCache(url: string, value: unknown): void {
    const ttlSeconds = this.options.cacheTtlSeconds ?? 0;
    if (ttlSeconds <= 0) {
      return;
    }
    this.cache.set(url, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
