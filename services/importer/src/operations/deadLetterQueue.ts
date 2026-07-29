export interface DeadLetterEntry<T> {
  readonly id: string;
  readonly payload: T;
  readonly error: string;
  readonly attempts: number;
  readonly failedAt: Date;
}

/**
 * Holds jobs that exhausted retries (or hit a non-retryable validation
 * failure) so an operator can inspect and optionally requeue them, per
 * specification/08-Import-Pipeline.md.txt's "Never restart from the
 * beginning" philosophy — a failed job's payload is preserved, not lost.
 */
export class DeadLetterQueue<T> {
  private readonly entries = new Map<string, DeadLetterEntry<T>>();

  add(id: string, payload: T, error: string, attempts: number): void {
    this.entries.set(id, { id, payload, error, attempts, failedAt: new Date() });
  }

  get(id: string): DeadLetterEntry<T> | null {
    return this.entries.get(id) ?? null;
  }

  list(): readonly DeadLetterEntry<T>[] {
    return [...this.entries.values()];
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  get size(): number {
    return this.entries.size;
  }
}
