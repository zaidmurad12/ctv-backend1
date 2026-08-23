import { Inject, Injectable, Logger } from '@nestjs/common';
import { isOk } from '@ctv-platform/domain';
import type { CacheClient } from '@ctv-platform/infrastructure';
import { CacheRepository } from '@ctv-platform/infrastructure';
import { titleSimilarity } from '@ctv-platform/importer';
import type { ContentProviderLinkPort } from '@ctv-platform/importer';
import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import type { ProviderCatalogItemDto, ProviderInterface } from '@ctv-platform/sdk';
import type { StreamResponseDto, SubtitleResponseDto } from '../catalog/dto.js';
import { ProvidersRuntime } from './providersRuntime.js';
import { ContentLinkReader } from './infrastructure/contentLinkReader.js';
import { ProviderRegistryRepository } from './infrastructure/providerRegistryRepository.js';
import { ProviderMetricsTracker } from './providerMetricsTracker.js';
import { CONTENT_PROVIDER_LINK, PROVIDER_CACHE_CLIENT } from './ports.js';

/** specification/07-TMDB-Integration.md.txt "Fuzzy Match: Similarity > 90%", reused for title-based provider matching. */
const MIN_TITLE_SIMILARITY = 0.9;
const STREAM_CACHE_TTL_SECONDS = Number(process.env.PROVIDER_STREAM_CACHE_TTL_SECONDS ?? 21600);

export interface ResolvableMovie {
  readonly id: string;
  readonly title: string;
}

export interface ResolvableEpisode {
  readonly id: string;
  readonly showTitle: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
}

function normalize(title: string): string {
  return title.trim().toLowerCase();
}

function pickBestMatch(
  items: readonly ProviderCatalogItemDto[],
  title: string,
  kind: 'movie' | 'show',
): ProviderCatalogItemDto | null {
  const candidates = items.filter((item) => item.kind === kind);
  let best: { item: ProviderCatalogItemDto; score: number } | null = null;
  for (const item of candidates) {
    const score = titleSimilarity(normalize(item.title), normalize(title));
    if (score >= MIN_TITLE_SIMILARITY && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best?.item ?? null;
}

/**
 * Live, on-demand resolution of streams/subtitles from whichever registered,
 * enabled provider ranks highest by priority and actually has them —
 * `apps/backend/src/catalog/useCases.ts` falls back to this only when the DB
 * has no pre-imported `Stream`/`Subtitle` rows for the content. Each
 * provider is tried in priority order; a failure (down, not found, no
 * match) logs and moves on to the next rather than throwing, so the caller
 * always gets an array — possibly empty — never an exception.
 */
@Injectable()
export class ProviderStreamResolver {
  private readonly logger = new Logger(ProviderStreamResolver.name);
  private readonly cache: CacheRepository<unknown>;

  constructor(
    private readonly runtime: ProvidersRuntime,
    private readonly registryRepository: ProviderRegistryRepository,
    private readonly linkReader: ContentLinkReader,
    private readonly metrics: ProviderMetricsTracker,
    @Inject(CONTENT_PROVIDER_LINK) private readonly links: ContentProviderLinkPort,
    @Inject(PROVIDER_CACHE_CLIENT) cacheClient: CacheClient,
  ) {
    this.cache = new CacheRepository(cacheClient);
  }

  async resolveMovieStreams(movie: ResolvableMovie): Promise<StreamResponseDto[]> {
    return this.resolveFor(
      ProviderCapabilityEnum.STREAMS,
      `provider:movie:${movie.id}:streams`,
      async (provider) => {
        const externalId = await this.resolveMovieExternalId(provider, movie);
        if (!externalId) return null;
        const result = await provider.streams(externalId);
        if (!isOk(result)) throw new Error(result.error.message);
        return result.value.map((stream, index) =>
          toStreamDto(provider.metadata.id, stream, index),
        );
      },
    );
  }

  async resolveMovieSubtitles(movie: ResolvableMovie): Promise<SubtitleResponseDto[]> {
    return this.resolveFor(
      ProviderCapabilityEnum.SUBTITLES,
      `provider:movie:${movie.id}:subtitles`,
      async (provider) => {
        const externalId = await this.resolveMovieExternalId(provider, movie);
        if (!externalId) return null;
        const result = await provider.subtitles(externalId);
        if (!isOk(result)) throw new Error(result.error.message);
        return result.value.map((subtitle, index) =>
          toSubtitleDto(provider.metadata.id, subtitle, index),
        );
      },
    );
  }

  async resolveEpisodeStreams(episode: ResolvableEpisode): Promise<StreamResponseDto[]> {
    return this.resolveFor(
      ProviderCapabilityEnum.STREAMS,
      `provider:episode:${episode.id}:streams`,
      async (provider) => {
        const externalId = await this.resolveEpisodeExternalId(provider, episode);
        if (!externalId) return null;
        const result = await provider.streams(externalId);
        if (!isOk(result)) throw new Error(result.error.message);
        return result.value.map((stream, index) =>
          toStreamDto(provider.metadata.id, stream, index),
        );
      },
    );
  }

  async resolveEpisodeSubtitles(episode: ResolvableEpisode): Promise<SubtitleResponseDto[]> {
    return this.resolveFor(
      ProviderCapabilityEnum.SUBTITLES,
      `provider:episode:${episode.id}:subtitles`,
      async (provider) => {
        const externalId = await this.resolveEpisodeExternalId(provider, episode);
        if (!externalId) return null;
        const result = await provider.subtitles(externalId);
        if (!isOk(result)) throw new Error(result.error.message);
        return result.value.map((subtitle, index) =>
          toSubtitleDto(provider.metadata.id, subtitle, index),
        );
      },
    );
  }

  /** Shared failover/caching loop: try each enabled provider, in priority order, until one succeeds. */
  private async resolveFor<T>(
    capability: ProviderCapabilityEnum,
    cacheKeyPrefix: string,
    attempt: (provider: ProviderInterface) => Promise<T[] | null>,
  ): Promise<T[]> {
    const candidates = await this.enabledCandidates(capability);
    for (const provider of candidates) {
      const cacheKey = `${cacheKeyPrefix}:${provider.metadata.id}`;
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          return cached as T[];
        }
      } catch {
        // Cache unavailable (e.g. Redis down) — fall through and resolve live.
      }

      try {
        const resolved = await attempt(provider);
        if (resolved === null) {
          continue;
        }
        this.metrics.recordSuccess(provider.metadata.id);
        try {
          await this.cache.set(cacheKey, resolved, STREAM_CACHE_TTL_SECONDS);
        } catch {
          // Caching is best-effort; a write failure never fails the request.
        }
        return resolved;
      } catch (error) {
        this.metrics.recordFailure(provider.metadata.id);
        this.logger.warn(
          `Provider "${provider.metadata.id}" failed to resolve ${capability}; failing over. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Never throw — move on to the next provider in priority order.
      }
    }
    return [];
  }

  private async enabledCandidates(
    capability: ProviderCapabilityEnum,
  ): Promise<ProviderInterface[]> {
    const all = this.runtime.registry.listByCapability(capability);
    const enabled: ProviderInterface[] = [];
    for (const provider of all) {
      const row = await this.registryRepository.findBySlug(provider.metadata.id);
      if (!row || row.isEnabled) {
        enabled.push(provider);
      }
    }
    return enabled;
  }

  private async resolveMovieExternalId(
    provider: ProviderInterface,
    movie: ResolvableMovie,
  ): Promise<string | null> {
    const providerDbId = await this.links.ensureProvider(
      provider.metadata.id,
      provider.metadata.name,
    );
    const existing = await this.linkReader.findMovieExternalId(movie.id, providerDbId);
    if (existing) {
      return existing;
    }

    const searchResult = await provider.search({ term: movie.title });
    if (!isOk(searchResult)) {
      return null;
    }
    const match = pickBestMatch(searchResult.value.items, movie.title, 'movie');
    if (!match) {
      return null;
    }

    await this.links.ensureMovieLink(movie.id, providerDbId, match.providerContentId, movie.title);
    return match.providerContentId;
  }

  private async resolveEpisodeExternalId(
    provider: ProviderInterface,
    episode: ResolvableEpisode,
  ): Promise<string | null> {
    const providerDbId = await this.links.ensureProvider(
      provider.metadata.id,
      provider.metadata.name,
    );
    const existing = await this.linkReader.findEpisodeExternalId(episode.id, providerDbId);
    if (existing) {
      return existing;
    }

    const searchResult = await provider.search({ term: episode.showTitle });
    if (!isOk(searchResult)) {
      return null;
    }
    const show = pickBestMatch(searchResult.value.items, episode.showTitle, 'show');
    if (!show) {
      return null;
    }

    const episodeResult = await provider.episode(
      show.providerContentId,
      episode.seasonNumber,
      episode.episodeNumber,
    );
    if (!isOk(episodeResult)) {
      return null;
    }

    await this.links.ensureEpisodeLink(
      episode.id,
      providerDbId,
      episodeResult.value.providerEpisodeId,
      episode.showTitle,
    );
    return episodeResult.value.providerEpisodeId;
  }
}

function toStreamDto(
  providerId: string,
  stream: {
    providerStreamId: string;
    quality: string;
    serverName: string;
    playbackUrl: string;
    codec?: string;
    language?: string;
  },
  index: number,
): StreamResponseDto {
  return {
    id: `${providerId}:${stream.providerStreamId}`,
    quality: stream.quality,
    codec: stream.codec ?? null,
    language: stream.language ?? null,
    serverName: stream.serverName,
    streamUrl: stream.playbackUrl,
    isDefault: index === 0,
  };
}

function toSubtitleDto(
  providerId: string,
  subtitle: { language: string; format: string; downloadUrl: string; isDefault: boolean },
  index: number,
): SubtitleResponseDto {
  return {
    id: `${providerId}:subtitle:${index}`,
    language: subtitle.language,
    format: subtitle.format,
    url: subtitle.downloadUrl,
    isDefault: subtitle.isDefault,
  };
}
