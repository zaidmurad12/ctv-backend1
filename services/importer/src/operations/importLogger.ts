import type { Logger } from '@ctv-platform/infrastructure';

export interface StageLogContext {
  readonly jobId: string;
  readonly providerId: string;
  readonly contentId?: string;
  readonly stage: string;
  readonly durationMs: number;
  readonly status: 'success' | 'failure';
  readonly error?: string;
}

/**
 * Enforces the fields specification/08-Import-Pipeline.md.txt requires of
 * every stage log line (Import Job ID, Provider, Movie ID, Stage, Duration,
 * Status, Error), on top of the plain `Logger` reused from
 * `@ctv-platform/infrastructure`.
 */
export class ImportLogger {
  constructor(private readonly logger: Logger) {}

  logStage(context: StageLogContext): void {
    const { status, stage, ...meta } = context;
    if (status === 'success') {
      this.logger.info(`Import stage "${stage}" succeeded`, { stage, ...meta });
    } else {
      this.logger.error(`Import stage "${stage}" failed`, { stage, ...meta });
    }
  }
}
