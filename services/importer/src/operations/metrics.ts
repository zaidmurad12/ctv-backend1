export interface ImportMetricsSnapshot {
  readonly moviesImported: number;
  readonly showsImported: number;
  readonly episodesImported: number;
  readonly streamsImported: number;
  readonly subtitlesImported: number;
  readonly failedImports: number;
  readonly retriedImports: number;
  readonly averageImportTimeMs: number;
}

/** specification/08-Import-Pipeline.md.txt "Metrics". */
export class ImportMetrics {
  private moviesImported = 0;
  private showsImported = 0;
  private episodesImported = 0;
  private streamsImported = 0;
  private subtitlesImported = 0;
  private failedImports = 0;
  private retriedImports = 0;
  private totalImportDurationMs = 0;
  private completedImportCount = 0;

  recordMovieImported(): void {
    this.moviesImported += 1;
  }

  recordShowImported(): void {
    this.showsImported += 1;
  }

  recordEpisodesImported(count: number): void {
    this.episodesImported += count;
  }

  recordStreamsImported(count: number): void {
    this.streamsImported += count;
  }

  recordSubtitlesImported(count: number): void {
    this.subtitlesImported += count;
  }

  recordFailure(): void {
    this.failedImports += 1;
  }

  recordRetry(): void {
    this.retriedImports += 1;
  }

  recordImportDuration(durationMs: number): void {
    this.totalImportDurationMs += durationMs;
    this.completedImportCount += 1;
  }

  snapshot(): ImportMetricsSnapshot {
    return {
      moviesImported: this.moviesImported,
      showsImported: this.showsImported,
      episodesImported: this.episodesImported,
      streamsImported: this.streamsImported,
      subtitlesImported: this.subtitlesImported,
      failedImports: this.failedImports,
      retriedImports: this.retriedImports,
      averageImportTimeMs:
        this.completedImportCount === 0
          ? 0
          : this.totalImportDurationMs / this.completedImportCount,
    };
  }
}
