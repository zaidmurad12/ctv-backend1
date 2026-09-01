import type { ProviderSubtitleDto } from '@ctv-platform/sdk';
import type { ReconcileSummary, SubtitleInput, SubtitlePort } from '../persistence/ports.js';

function toSubtitleInputs(subtitles: readonly ProviderSubtitleDto[]): SubtitleInput[] {
  return subtitles.map((subtitle) => ({
    language: subtitle.language,
    format: subtitle.format.toUpperCase(),
    downloadUrl: subtitle.downloadUrl,
    isDefault: subtitle.isDefault,
  }));
}

export class SubtitleImporter {
  constructor(private readonly subtitles: SubtitlePort) {}

  importForMovie(
    movieProviderId: string,
    subtitles: readonly ProviderSubtitleDto[],
  ): Promise<ReconcileSummary> {
    return this.subtitles.reconcileForMovieLink(movieProviderId, toSubtitleInputs(subtitles));
  }

  importForEpisode(
    episodeProviderId: string,
    subtitles: readonly ProviderSubtitleDto[],
  ): Promise<ReconcileSummary> {
    return this.subtitles.reconcileForEpisodeLink(episodeProviderId, toSubtitleInputs(subtitles));
  }
}
