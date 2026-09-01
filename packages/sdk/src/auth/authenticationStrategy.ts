import { ok } from '@ctv-platform/domain';
import type { ProviderResult } from '../result.js';

/**
 * Authentication is entirely internal to a provider (never managed by
 * Core). A strategy encapsulates how a specific provider obtains and
 * refreshes its own credentials; `AbstractProvider` calls it on demand when
 * a request comes back unauthorized.
 */
export interface AuthenticationStrategy<TCredentials = unknown> {
  authenticate(): Promise<ProviderResult<TCredentials>>;
  isExpired(credentials: TCredentials): boolean;
}

/**
 * The correct default for providers that need no login flow (e.g. a static
 * API key passed in via config). This is a real, valid strategy in its own
 * right, not a stand-in for one.
 */
export class NoopAuthenticationStrategy implements AuthenticationStrategy<null> {
  async authenticate(): Promise<ProviderResult<null>> {
    return ok(null);
  }

  isExpired(): boolean {
    return false;
  }
}
