import { randomUUID } from 'node:crypto';
import { err, isOk, ok } from '@ctv-platform/domain';
import type { EpisodeRepository, SeasonRepository, TVShowRepository } from '@ctv-platform/domain';
import { EpisodeFactory, SeasonFactory } from '@ctv-platform/domain';
import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import type { ProviderInterface, ProviderRegistry, ProviderSeasonDto } from '@ctv-platform/sdk';
import { ImportFailureCategoryEnum } from '../enums.js';
import { ImportError, type ImportResult } from '../errors.js';
import { CanonicalShowResolver } from '../matching/canonicalContentResolver.js';
import { mergeShowMetadata, validateShowMetadata } from '../metadata/index.js';
import type { MetadataEnricher } from '../metadata/index.js';
import { processArtwork } from '../media/index.js';
import type { ArtworkImporter, StreamImporter, SubtitleImporter } from '../media/index.js';
import type { ContentProviderLinkPort } from '../persistence/ports.js';
import type { PublishOutcome, PublishingPipeline } from '../publishing/index.js';
import {
  validateEpisodeForPublish,
  validateMedia,
  validateShowForPublish,
} from '../validation/index.js';
import { mapProviderErrorCode } from './errorMapping.js';

const STAGE = 'show-import';

export interface ShowImportOrchestratorDependencies {
  readonly registry: ProviderRegistry;
  readonly shows: TVShowRepository;
  readonly seasons: SeasonRepository;
  readonly episodes: EpisodeRepository;
  readonly links: ContentProviderLinkPort;
  readonly streamImporter: StreamImporter;
  readonly subtitleImporter: SubtitleImporter;
  readonly artworkImporter: ArtworkImporter;
  readonly metadataEnricher: MetadataEnricher;
  readonly publishingPipeline: PublishingPipeline;
}

/**
 * Runs the full per-show pipeline from
 * specification/08-Import-Pipeline.md.txt "TV Show Pipeline": TV Details ->
 * Season Discovery -> Episode Discovery -> Episode Streams/Subtitles ->
 * TMDB Match -> Metadata -> Database -> Search.
 */
export class ShowImportOrchestrator {
  constructor(private readonly deps: ShowImportOrchestratorDependencies) {}

  async importOne(
    provider: ProviderInterface,
    providerContentId: string,
  ): Promise<ImportResult<PublishOutcome>> {
    const detailResult = await provider.show(providerContentId);
    if (!isOk(detailResult)) {
      return err(
        new ImportError(
          mapProviderErrorCode(detailResult.error.code),
          STAGE,
          detailResult.error.message,
          {
            cause: detailResult.error,
          },
        ),
      );
    }
    const sourceDto = detailResult.value;

    const providerDbId = await this.deps.links.ensureProvider(
      provider.metadata.id,
      provider.metadata.name,
    );
    const { show } = await new CanonicalShowResolver(this.deps.links, this.deps.shows).resolve(
      providerDbId,
      providerContentId,
      sourceDto.title,
    );

    const metadataProviders = this.deps.registry
      .listByCapability(ProviderCapabilityEnum.METADATA_ENRICHMENT)
      .filter((candidate) => candidate.metadata.id !== provider.metadata.id);
    const enrichment = await this.deps.metadataEnricher.enrichShow(sourceDto, metadataProviders);
    const merged = mergeShowMetadata(sourceDto, enrichment);

    const metadataValidation = validateShowMetadata(merged);
    if (!metadataValidation.valid) {
      return err(
        new ImportError(
          ImportFailureCategoryEnum.VALIDATION_ERROR,
          STAGE,
          metadataValidation.issues.join('; '),
        ),
      );
    }

    const episodeCount = await this.importSeasons(show.id, providerDbId, merged.seasons);
    show.updateCounts(merged.seasons.length, episodeCount);

    const showValidation = validateShowForPublish({
      hasProviderLink: true,
      seasonCount: merged.seasons.length,
      episodeCount,
    });
    if (!showValidation.valid) {
      return err(
        new ImportError(
          ImportFailureCategoryEnum.VALIDATION_ERROR,
          STAGE,
          showValidation.issues.join('; '),
        ),
      );
    }

    const publishResult = await this.deps.publishingPipeline.publishShow(
      show,
      providerDbId,
      providerContentId,
      merged.isAvailable,
    );
    if (!isOk(publishResult)) {
      return publishResult;
    }

    const processedArtwork = processArtwork(merged.artwork, provider.metadata.name);
    await this.deps.artworkImporter.importForShow(show.id, processedArtwork.items);

    return ok(publishResult.value);
  }

  /** Imports every season and its episodes, returning the total valid episode count. */
  private async importSeasons(
    showId: string,
    providerDbId: string,
    seasonDtos: readonly ProviderSeasonDto[],
  ): Promise<number> {
    const existingSeasons = await this.deps.seasons.findByShowId(showId);
    const seasonsByNumber = new Map(existingSeasons.map((season) => [season.seasonNumber, season]));
    let totalEpisodes = 0;

    for (const seasonDto of seasonDtos) {
      const season =
        seasonsByNumber.get(seasonDto.seasonNumber) ??
        SeasonFactory.create({
          id: randomUUID(),
          showId,
          seasonNumber: seasonDto.seasonNumber,
          title: seasonDto.title,
        });
      season.updateMetadata({ title: seasonDto.title, episodeCount: seasonDto.episodes.length });
      await this.deps.seasons.save(season);

      totalEpisodes += await this.importEpisodes(
        season.id,
        seasonDto.seasonNumber,
        providerDbId,
        seasonDto,
      );
    }

    return totalEpisodes;
  }

  /** Imports every valid episode in a season, returning how many were valid. */
  private async importEpisodes(
    seasonId: string,
    seasonNumber: number,
    providerDbId: string,
    seasonDto: ProviderSeasonDto,
  ): Promise<number> {
    const existingEpisodes = await this.deps.episodes.findBySeasonId(seasonId);
    const episodesByNumber = new Map(
      existingEpisodes.map((episode) => [episode.episodeNumber, episode]),
    );
    let validCount = 0;

    for (const episodeDto of seasonDto.episodes) {
      const mediaValidation = validateMedia(episodeDto.streams, episodeDto.subtitles);
      const episodeValidation = validateEpisodeForPublish({
        seasonNumber,
        episodeNumber: episodeDto.episodeNumber,
        validStreamCount: mediaValidation.validStreams.length,
      });
      if (!episodeValidation.valid) {
        continue;
      }

      const episode =
        episodesByNumber.get(episodeDto.episodeNumber) ??
        EpisodeFactory.create({
          id: randomUUID(),
          seasonId,
          episodeNumber: episodeDto.episodeNumber,
          title: episodeDto.title,
          overview: episodeDto.overview,
        });
      await this.deps.episodes.save(episode);

      const episodeLinkId = await this.deps.links.ensureEpisodeLink(
        episode.id,
        providerDbId,
        episodeDto.providerEpisodeId,
        episodeDto.title,
      );
      await this.deps.streamImporter.importForEpisode(episodeLinkId, mediaValidation.validStreams);
      await this.deps.subtitleImporter.importForEpisode(
        episodeLinkId,
        mediaValidation.validSubtitles,
      );

      validCount += 1;
    }

    return validCount;
  }
}
