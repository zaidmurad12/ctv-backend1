import { ApiError } from './apiError';
import { tokenStorage } from './tokenStorage';
import type { ApiErrorResponse, ApiSuccessResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

let unauthorizedHandler: (() => void) | undefined;

/** Registered once by AuthContext so a failed silent-refresh can sign the user out. */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly params?: QueryParams;
  /** Skips the Authorization header and refresh-on-401 retry (used by the auth endpoints themselves). */
  readonly skipAuth?: boolean;
  /** Skips the retry-once-after-refresh loop (used internally by the refresh call itself). */
  readonly skipRetry?: boolean;
}

// Refresh tokens are single-use (rotated server-side) — the home page fires ~9 requests at
// once, so without de-duping, each 401 would race its own refresh call, and every loser
// would see its token already rotated out from under it and sign the user out.
let refreshPromise: Promise<string | null> | undefined;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = undefined;
    });
  }
  return refreshPromise;
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(buildUrl('auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const body = (await response.json()) as
    ApiSuccessResponse<{ accessToken: string; refreshToken: string }> | ApiErrorResponse;
  if (!response.ok || !body.success) {
    return null;
  }
  tokenStorage.setTokens(body.data.accessToken, body.data.refreshToken);
  return body.data.accessToken;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, skipAuth = false, skipRetry = false } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const accessToken = tokenStorage.getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!response.ok || !payload.success) {
    if (response.status === 401 && !skipAuth && !skipRetry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return rawRequest<T>(path, { ...options, skipRetry: true });
      }
      tokenStorage.clear();
      unauthorizedHandler?.();
    }
    const errorPayload = payload as ApiErrorResponse;
    throw new ApiError(
      response.status,
      errorPayload.error?.code ?? 'UNKNOWN_ERROR',
      errorPayload.error?.message ?? 'An unexpected error occurred.',
      errorPayload.error?.details,
    );
  }

  return payload.data;
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return rawRequest<T>(path, options);
}
