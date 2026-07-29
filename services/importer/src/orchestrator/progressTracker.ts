export interface ProgressSnapshot {
  readonly total: number;
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly currentStage: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly percentage: number;
}

/**
 * Tracks a single import run's progress, per
 * specification/08-Import-Pipeline.md.txt "Progress Tracking": Started Time,
 * Finished Time, Current Stage, Progress Percentage, Errors.
 */
export class ProgressTracker {
  private processed = 0;
  private succeeded = 0;
  private failed = 0;
  private currentStage: string | null = null;
  private readonly startedAt = new Date();
  private finishedAt: Date | null = null;

  constructor(private readonly total: number) {}

  setStage(stage: string): void {
    this.currentStage = stage;
  }

  recordSuccess(): void {
    this.processed += 1;
    this.succeeded += 1;
  }

  recordFailure(): void {
    this.processed += 1;
    this.failed += 1;
  }

  finish(): void {
    this.finishedAt = new Date();
  }

  snapshot(): ProgressSnapshot {
    const percentage = this.total === 0 ? 100 : Math.round((this.processed / this.total) * 100);
    return {
      total: this.total,
      processed: this.processed,
      succeeded: this.succeeded,
      failed: this.failed,
      currentStage: this.currentStage,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      percentage,
    };
  }
}
