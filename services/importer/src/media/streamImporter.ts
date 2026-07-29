import type { ProviderStreamDto } from '@ctv-platform/sdk';
import type { ReconcileSummary, StreamInput, StreamPort } from '../persistence/ports.js';

/**
 * `ProviderStreamDto` (Milestone 3) carries no "default stream" flag, so the
 * first entry in provider-returned order is treated as the default — a
 * documented heuristic, not a guess hidden in the code.
 */
function toStreamInputs(streams: readonly ProviderStreamDto[]): StreamInput[] {
  return streams.map((stream, index) => ({
    quality: stream.quality,
    serverName: stream.serverName,
    playbackUrl: stream.playbackUrl,
    codec: stream.codec,
    language: stream.language,
    isDefault: index === 0,
  }));
}

export class StreamImporter {
  constructor(private readonly streams: StreamPort) {}

  importForMovie(
    movieProviderId: string,
    streams: readonly ProviderStreamDto[],
  ): Promise<ReconcileSummary> {
    return this.streams.reconcileForMovieLink(movieProviderId, toStreamInputs(streams));
  }

  importForEpisode(
    episodeProviderId: string,
    streams: readonly ProviderStreamDto[],
  ): Promise<ReconcileSummary> {
    return this.streams.reconcileForEpisodeLink(episodeProviderId, toStreamInputs(streams));
  }
}
