import { ImportFailureCategoryEnum } from '../enums.js';

export interface JobRetryDecision {
  readonly shouldRetry: boolean;
  readonly delayMs: number;
}

export interface JobRetryPolicyConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Job-level retry table from specification/08-Import-Pipeline.md.txt
 * ("Retry Policy"): timeout/network/rate-limit/provider/authentication
 * failures retry with backoff; a validation failure stops immediately and
 * is sent straight to the dead letter queue.
 */
const RETRYABLE_CATEGORIES: ReadonlySet<ImportFailureCategoryEnum> = new Set([
  ImportFailureCategoryEnum.TIMEOUT,
  ImportFailureCategoryEnum.NETWORK_ERROR,
  ImportFailureCategoryEnum.RATE_LIMIT,
  ImportFailureCategoryEnum.PROVIDER_ERROR,
  ImportFailureCategoryEnum.AUTHENTICATION_ERROR,
  ImportFailureCategoryEnum.UNKNOWN_ERROR,
]);

const NO_RETRY: JobRetryDecision = { shouldRetry: false, delayMs: 0 };

export class JobRetryPolicy {
  constructor(private readonly config: JobRetryPolicyConfig) {}

  decide(category: ImportFailureCategoryEnum, attempt: number): JobRetryDecision {
    if (attempt >= this.config.maxAttempts || !RETRYABLE_CATEGORIES.has(category)) {
      return NO_RETRY;
    }
    const delayMs = Math.min(this.config.baseDelayMs * 2 ** (attempt - 1), this.config.maxDelayMs);
    return { shouldRetry: true, delayMs };
  }
}
