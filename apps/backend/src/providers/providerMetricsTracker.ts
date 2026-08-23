import { Injectable } from '@nestjs/common';

interface Counters {
  ok: number;
  fail: number;
}

/**
 * Process-lifetime success/failure counters per provider, surfaced as
 * "Success Rate" in the admin Providers page. Deliberately in-memory rather
 * than persisted (resets on restart) — persisting it would mean new counter
 * columns on `Provider`, left out for v1 to avoid unnecessary schema growth.
 */
@Injectable()
export class ProviderMetricsTracker {
  private readonly counters = new Map<string, Counters>();

  recordSuccess(providerId: string): void {
    this.bump(providerId).ok += 1;
  }

  recordFailure(providerId: string): void {
    this.bump(providerId).fail += 1;
  }

  /** Success rate in [0, 1], or `null` if this provider has never been used. */
  successRate(providerId: string): number | null {
    const counters = this.counters.get(providerId);
    if (!counters || counters.ok + counters.fail === 0) {
      return null;
    }
    return counters.ok / (counters.ok + counters.fail);
  }

  private bump(providerId: string): Counters {
    const existing = this.counters.get(providerId);
    if (existing) {
      return existing;
    }
    const created: Counters = { ok: 0, fail: 0 };
    this.counters.set(providerId, created);
    return created;
  }
}
