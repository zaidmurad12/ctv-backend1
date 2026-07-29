import { ProviderErrorCodeEnum } from '../enums.js';

export interface RetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs: number;
  readonly refreshAuthentication: boolean;
}

export interface RetryPolicy {
  decide(code: ProviderErrorCodeEnum, attempt: number): RetryDecision;
}

export interface RetryPolicyConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Codes worth retrying, per `specification/05-Provider-Architecture.md.txt`
 * and `specification/06-Cinemana-Reverse-Engineering.md.txt`: network/timeout
 * and 5xx-style failures retry, 429 retries with delay, 401 retries once
 * after refreshing authentication. 403/404/invalid-response/not-supported
 * never retry.
 */
export const DEFAULT_RETRYABLE_ERROR_CODES: ReadonlySet<ProviderErrorCodeEnum> = new Set([
  ProviderErrorCodeEnum.TIMEOUT,
  ProviderErrorCodeEnum.RATE_LIMITED,
  ProviderErrorCodeEnum.UNAUTHORIZED,
  ProviderErrorCodeEnum.UNKNOWN_ERROR,
]);

const NO_RETRY: RetryDecision = { shouldRetry: false, delayMs: 0, refreshAuthentication: false };

export class ExponentialBackoffRetryPolicy implements RetryPolicy {
  constructor(
    private readonly config: RetryPolicyConfig,
    private readonly retryableCodes: ReadonlySet<ProviderErrorCodeEnum> = DEFAULT_RETRYABLE_ERROR_CODES,
  ) {}

  decide(code: ProviderErrorCodeEnum, attempt: number): RetryDecision {
    if (attempt >= this.config.maxAttempts || !this.retryableCodes.has(code)) {
      return NO_RETRY;
    }

    const delayMs = Math.min(this.config.baseDelayMs * 2 ** (attempt - 1), this.config.maxDelayMs);
    return {
      shouldRetry: true,
      delayMs,
      refreshAuthentication: code === ProviderErrorCodeEnum.UNAUTHORIZED,
    };
  }
}
