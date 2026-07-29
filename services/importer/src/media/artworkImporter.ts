import type { ArtworkInput, ArtworkPort, ReconcileSummary } from '../persistence/ports.js';

export class ArtworkImporter {
  constructor(private readonly artwork: ArtworkPort) {}

  importForMovie(movieId: string, items: readonly ArtworkInput[]): Promise<ReconcileSummary> {
    return this.artwork.reconcileForMovie(movieId, items);
  }

  importForShow(showId: string, items: readonly ArtworkInput[]): Promise<ReconcileSummary> {
    return this.artwork.reconcileForShow(showId, items);
  }
}
