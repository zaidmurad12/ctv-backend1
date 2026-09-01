export interface RateLimiter {
  /** Resolves once a request slot is available, waiting out any window or cooldown. */
  acquire(): Promise<void>;
  /** Informs the limiter that the provider reported a 429 so future acquires cool down. */
  reportRateLimited(cooldownMs?: number): void;
}

/**
 * A fixed-window limiter with an additional cooldown gate for explicit
 * rate-limit responses. The clock is injectable so tests never depend on
 * real wall-clock timers.
 */
export class FixedWindowRateLimiter implements RateLimiter {
  private windowStart: number;
  private requestCount = 0;
  private cooldownUntil = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly intervalMs: number,
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    this.windowStart = this.clock();
  }

  async acquire(): Promise<void> {
    const cooldownRemaining = this.cooldownUntil - this.clock();
    if (cooldownRemaining > 0) {
      await this.sleep(cooldownRemaining);
    }

    this.resetWindowIfElapsed();
    if (this.requestCount >= this.maxRequests) {
      const waitMs = this.windowStart + this.intervalMs - this.clock();
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
      this.resetWindowIfElapsed(true);
    }

    this.requestCount += 1;
  }

  reportRateLimited(cooldownMs: number = this.intervalMs): void {
    this.cooldownUntil = this.clock() + cooldownMs;
  }

  private resetWindowIfElapsed(force = false): void {
    const now = this.clock();
    if (force || now - this.windowStart >= this.intervalMs) {
      this.windowStart = now;
      this.requestCount = 0;
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
