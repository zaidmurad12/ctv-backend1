import { isOk } from '@ctv-platform/domain';
import type { ProviderError } from '../errors.js';
import type { ProviderResult } from '../result.js';
import type { RetryDecision, RetryPolicy } from './retryPolicy.js';

export interface ExecuteWithRetryHooks {
  readonly onRetry?: (decision: RetryDecision, attempt: number, error: ProviderError) => void;
  readonly onRefreshAuthentication?: () => Promise<void>;
  readonly delay?: (ms: number) => Promise<void>;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `operation` until it succeeds or the policy gives up. Authentication
 * refresh and delays are injected so tests never need real timers or a real
 * provider.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<ProviderResult<T>>,
  policy: RetryPolicy,
  hooks: ExecuteWithRetryHooks = {},
): Promise<ProviderResult<T>> {
  const delay = hooks.delay ?? defaultDelay;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const result = await operation();
    if (isOk(result)) {
      return result;
    }

    const decision = policy.decide(result.error.code, attempt);
    hooks.onRetry?.(decision, attempt, result.error);
    if (!decision.shouldRetry) {
      return result;
    }

    if (decision.refreshAuthentication && hooks.onRefreshAuthentication) {
      await hooks.onRefreshAuthentication();
    }
    if (decision.delayMs > 0) {
      await delay(decision.delayMs);
    }
  }
}
