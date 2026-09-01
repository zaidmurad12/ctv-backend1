import { err, isOk, ok } from '@ctv-platform/domain';
import type { MovieRepository } from '@ctv-platform/domain';
import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import type { ProviderInterface, ProviderRegistry } from '@ctv-platform/sdk';
import { ImportFailureCategoryEnum } from '../enums.js';
import { ImportError, type ImportResult } from '../errors.js';
import { CanonicalMovieResolver } from '../matching/canonicalContentResolver.js';
import {
  extractEnrichmentFields,
  mergeMovieMetadata,
  validateMovieMetadata,
} from '../metadata/index.js';
import type { MetadataEnricher } from '../metadata/index.js';
import { processArtwork } from '../media/index.js';
import type { ArtworkImporter, StreamImporter, SubtitleImporter } from '../media/index.js';
import type { ContentProviderLinkPort } from '../persistence/ports.js';
import type { PublishOutcome, PublishingPipeline } from '../publishing/index.js';
import { validateMedia, validateMovieForPublish } from '../validation/index.js';
import { mapProviderErrorCode } from './errorMapping.js';

const STAGE = 'movie-import';

export interface MovieImportOrchestratorDependencies {
  readonly registry: ProviderRegistry;
  readonly movies: MovieRepository;
  readonly links: ContentProviderLinkPort;
  readonly streamImporter: StreamImporter;
  readonly subtitleImporter: SubtitleImporter;
  readonly artworkImporter: ArtworkImporter;
  readonly metadataEnricher: MetadataEnricher;
  readonly publishingPipeline: PublishingPipeline;
}

/**
 * Runs the full per-movie pipeline from
 * specification/08-Import-Pipeline.md.txt: Movie Details -> Stream/Subtitle
 * Discovery -> TMDB Match -> Metadata -> Artwork -> Validation -> Database.
 */
export class MovieImportOrchestrator {
  constructor(private readonly deps: MovieImportOrchestratorDependencies) {}

  async importOne(
    provider: ProviderInterface,
    providerContentId: string,
  ): Promise<ImportResult<PublishOutcome>> {
    const detailResult = await provider.movie(providerContentId);
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
    const { movie } = await new CanonicalMovieResolver(this.deps.links, this.deps.movies).resolve(
      providerDbId,
      providerContentId,
      sourceDto.title,
    );

    const metadataProviders = this.deps.registry
      .listByCapability(ProviderCapabilityEnum.METADATA_ENRICHMENT)
      .filter((candidate) => candidate.metadata.id !== provider.metadata.id);
    const enrichment = await this.deps.metadataEnricher.enrichMovie(sourceDto, metadataProviders);
    const merged = mergeMovieMetadata(sourceDto, enrichment);

    const metadataValidation = validateMovieMetadata(merged);
    if (!metadataValidation.valid) {
      return err(
        new ImportError(
          ImportFailureCategoryEnum.VALIDATION_ERROR,
          STAGE,
          metadataValidation.issues.join('; '),
        ),
      );
    }

    const enrichmentFields = extractEnrichmentFields(merged);
    movie.updateMetadata({
      title: merged.title,
      overview: merged.overview,
      rating: enrichmentFields.rating,
      runtimeMinutes: enrichmentFields.runtimeMinutes,
      trailerUrl: enrichmentFields.trailerUrl,
    });

    const mediaValidation = validateMedia(merged.streams, merged.subtitles);
    const contentValidation = validateMovieForPublish({
      hasProviderLink: true,
      validStreamCount: mediaValidation.validStreams.length,
    });
    if (!contentValidation.valid) {
      return err(
        new ImportError(
          ImportFailureCategoryEnum.VALIDATION_ERROR,
          STAGE,
          contentValidation.issues.join('; '),
        ),
      );
    }

    const publishResult = await this.deps.publishingPipeline.publishMovie(
      movie,
      providerDbId,
      providerContentId,
      merged.isAvailable,
    );
    if (!isOk(publishResult)) {
      return publishResult;
    }

    const { linkId } = publishResult.value;
    await this.deps.streamImporter.importForMovie(linkId, mediaValidation.validStreams);
    await this.deps.subtitleImporter.importForMovie(linkId, mediaValidation.validSubtitles);
    const processedArtwork = processArtwork(merged.artwork, provider.metadata.name);
    await this.deps.artworkImporter.importForMovie(movie.id, processedArtwork.items);

    return ok(publishResult.value);
  }
}
