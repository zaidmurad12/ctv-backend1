export type CinemanaHttpErrorKind = 'timeout' | 'network' | 'http';

/** A typed transport failure; the provider layer maps this to a `ProviderErrorCodeEnum`. */
export class CinemanaHttpError extends Error {
  readonly kind: CinemanaHttpErrorKind;
  readonly status: number | null;

  constructor(kind: CinemanaHttpErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'CinemanaHttpError';
    this.kind = kind;
    this.status = status;
  }
}

export interface CinemanaHttpClientOptions {
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
 * Thin fetch wrapper around `cinemana.shabakaty.com`'s undocumented Android
 * API. Unlike Consumet's REST routes, two of these four endpoints
 * (`transcoddedFiles`/`videoSeason`/`allVideoInfo`) take the id as a raw path
 * suffix rather than a query parameter - `getById` covers those, `get`
 * covers `AdvancedSearch`'s query-string form. Carries no retry/rate-limit
 * logic of its own (`AbstractProvider` already owns that uniformly); this
 * client's only extra responsibility is the raw-response cache, which
 * matters more here than for most providers since the stream/subtitle
 * responses embed short-lived presigned URLs that must never outlive
 * `cacheTtlSeconds`.
 */
export class CinemanaHttpClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: CinemanaHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), `${this.options.baseUrl.replace(/\/$/, '')}/`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return this.request<T>(url.toString());
  }

  getById<T>(routePrefix: string, id: string): Promise<T> {
    const base = this.options.baseUrl.replace(/\/$/, '');
    return this.request<T>(`${base}/${routePrefix.replace(/^\/|\/$/g, '')}/id/${encodeURIComponent(id)}`);
  }

  private async request<T>(url: string): Promise<T> {
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
        throw new CinemanaHttpError('timeout', `Request to "${url}" timed out.`);
      }
      throw new CinemanaHttpError(
        'network',
        error instanceof Error ? error.message : `Network error requesting "${url}".`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new CinemanaHttpError(
        'http',
        `Cinemana request to "${url}" failed with status ${response.status}.`,
        response.status,
      );
    }

    const body = (await response.json()) as T;
    this.writeCache(url, body);
    return body;
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
