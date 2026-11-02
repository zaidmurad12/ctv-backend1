import { Injectable } from '@nestjs/common';
import { isOk } from '@ctv-platform/domain';
import type { ProviderInterface, ProviderStreamDto } from '@ctv-platform/sdk';
import { PrismaService } from '../../prisma/prismaService.js';
import { ProvidersRuntime } from '../../providers/providersRuntime.js';

export interface BackfillSummary {
  movies: { scanned: number; linked: number; streams: number; subtitles: number; skipped: number };
  shows: { scanned: number; linked: number; episodes: number; streams: number; subtitles: number; skipped: number };
  nextCursor?: string;
}

export type BackfillScope = 'all' | 'movies';

@Injectable()
export class CinemanaBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersRuntime,
  ) {}

  async run(limit?: number, scope: BackfillScope = 'all', cursor?: string): Promise<BackfillSummary> {
    const provider = this.providers.registry.tryResolve('cinemana');
    if (!provider) {
      throw new Error('Cinemana provider is disabled or not registered.');
    }
    const providerRow = await this.prisma.client.provider.findUnique({ where: { slug: 'cinemana' } });
    if (!providerRow) {
      throw new Error('Cinemana provider row has not been initialized.');
    }

    const movies = await this.prisma.client.movie.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(scope === 'movies'
          ? { providers: { none: { streams: { some: { isActive: true } } } } }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: { providers: { include: { streams: true, subtitles: true } } },
      take: limit,
      orderBy: { id: 'asc' },
    });
    const shows = scope === 'movies'
      ? []
      : await this.prisma.client.tVShow.findMany({
          where: { status: 'PUBLISHED', deletedAt: null },
          include: { providers: true, seasons: { include: { episodes: { include: { providers: { include: { streams: true, subtitles: true } } } } } } },
          take: limit,
          orderBy: { id: 'asc' },
        });
    const publishedMovies = movies;
    const publishedShows = shows;

    const summary: BackfillSummary = {
      movies: { scanned: publishedMovies.length, linked: 0, streams: 0, subtitles: 0, skipped: 0 },
      shows: { scanned: publishedShows.length, linked: 0, episodes: 0, streams: 0, subtitles: 0, skipped: 0 },
    };

    for (const movie of publishedMovies) {
      const link = await this.ensureMovieLink(provider, providerRow.id, movie);
      if (!link) {
        summary.movies.skipped += 1;
        continue;
      }
      if (link.created) summary.movies.linked += 1;
      const media = await this.fetchMedia(provider, link.externalId);
      summary.movies.streams += await this.reconcileStreams('movieProviderId', link.id, media.streams);
      // Subtitle auto-attach disabled per explicit request - a viewer-facing subtitle should only
      // ever come from an admin's own deliberate action (a direct URL, or picking a specific
      // OpenSubtitles search/hash result), never silently attached by this backfill. Streams are
      // unaffected - only subtitles were asked to stop importing automatically.
    }

    for (const show of publishedShows) {
      const link = await this.ensureShowLink(provider, providerRow.id, show);
      if (!link) {
        summary.shows.skipped += 1;
        continue;
      }
      if (link.created) summary.shows.linked += 1;
      const providerShow = await provider.show(link.externalId);
      if (!isOk(providerShow)) {
        summary.shows.skipped += 1;
        continue;
      }
      const episodeByNumber = new Map(
        providerShow.value.seasons.flatMap((season) =>
          season.episodes.map((episode) => [`${season.seasonNumber}:${episode.episodeNumber}`, episode.providerEpisodeId] as const),
        ),
      );
      for (const season of show.seasons) {
        for (const episode of season.episodes) {
          const externalId = episodeByNumber.get(`${season.seasonNumber}:${episode.episodeNumber}`);
          if (!externalId) {
            summary.shows.skipped += 1;
            continue;
          }
          const episodeLink = await this.prisma.client.episodeProvider.upsert({
            where: { episodeId_providerId: { episodeId: episode.id, providerId: providerRow.id } },
            create: { episodeId: episode.id, providerId: providerRow.id, externalId, sourceTitle: episode.title },
            update: { externalId, sourceTitle: episode.title },
            include: { streams: true, subtitles: true },
          });
          const media = await this.fetchMedia(provider, externalId);
          summary.shows.episodes += 1;
          summary.shows.streams += await this.reconcileStreams('episodeProviderId', episodeLink.id, media.streams);
          // See the movie loop's own identical comment above - subtitle auto-attach disabled.
        }
      }
    }

    await this.prisma.client.provider.update({ where: { id: providerRow.id }, data: { lastSyncAt: new Date() } });
    if (publishedMovies.length > 0 || publishedShows.length > 0) {
      summary.nextCursor = (scope === 'movies' ? publishedMovies.at(-1)?.id : publishedShows.at(-1)?.id) ?? undefined;
    }
    return summary;
  }

  private async ensureMovieLink(provider: ProviderInterface, providerId: string, movie: { id: string; title: string; releaseDate: Date | null; providers: Array<{ id: string; providerId: string; externalId: string | null }> }) {
    const existing = movie.providers.find((item) => item.providerId === providerId && item.externalId);
    if (existing?.externalId) return { ...existing, created: false, externalId: existing.externalId };
    const match = await this.searchMatch(provider, movie.title, 'movie');
    if (!match) return null;
    const link = await this.prisma.client.movieProvider.upsert({
      where: { movieId_providerId: { movieId: movie.id, providerId } },
      create: { movieId: movie.id, providerId, externalId: match.providerContentId, sourceTitle: match.title },
      update: { externalId: match.providerContentId, sourceTitle: match.title },
      include: { streams: true, subtitles: true },
    });
    return { ...link, created: true, externalId: match.providerContentId };
  }

  private async ensureShowLink(provider: ProviderInterface, providerId: string, show: { id: string; title: string; providers: Array<{ id: string; providerId: string; externalId: string | null }> }) {
    const existing = show.providers.find((item) => item.providerId === providerId && item.externalId);
    if (existing?.externalId) return { ...existing, created: false, externalId: existing.externalId };
    const match = await this.searchMatch(provider, show.title, 'show');
    if (!match) return null;
    const link = await this.prisma.client.tVShowProvider.upsert({
      where: { showId_providerId: { showId: show.id, providerId } },
      create: { showId: show.id, providerId, externalId: match.providerContentId, sourceTitle: match.title },
      update: { externalId: match.providerContentId, sourceTitle: match.title },
    });
    return { ...link, created: true, externalId: match.providerContentId };
  }

  private async searchMatch(provider: ProviderInterface, title: string, kind: 'movie' | 'show') {
    const result = await provider.search({ term: title, page: 1 });
    if (!isOk(result)) return null;
    const normalized = this.normalize(title);
    return result.value.items.find((item) => item.kind === kind && this.normalize(item.title) === normalized) ?? null;
  }

  private async fetchMedia(provider: ProviderInterface, externalId: string) {
    // Subtitles no longer fetched here at all - see reconcileSubtitles' own removal note above;
    // there's nothing left to do with them, so no point spending a request on it.
    const streamsResult = await provider.streams(externalId);
    return {
      streams: streamsResult && isOk(streamsResult) ? streamsResult.value : [],
    };
  }

  private async reconcileStreams(field: 'movieProviderId' | 'episodeProviderId', linkId: string, incoming: readonly ProviderStreamDto[]): Promise<number> {
    const existing = await this.prisma.client.stream.findMany({ where: { [field]: linkId } });
    const incomingUrls = new Set(incoming.map((stream) => stream.playbackUrl));
    for (const [index, stream] of incoming.entries()) {
      const current = existing.find((row) => row.streamUrl === stream.playbackUrl);
      const data = {
        quality: stream.quality,
        serverName: stream.serverName,
        codec: stream.codec ?? null,
        language: stream.language ?? null,
        isDefault: index === 0,
        isActive: true,
      };
      if (current) await this.prisma.client.stream.update({ where: { id: current.id }, data });
      else await this.prisma.client.stream.create({ data: { [field]: linkId, streamUrl: stream.playbackUrl, ...data } });
    }
    for (const row of existing) {
      if (row.isActive && !incomingUrls.has(row.streamUrl)) {
        await this.prisma.client.stream.update({ where: { id: row.id }, data: { isActive: false } });
      }
    }
    return incoming.length;
  }

  private normalize(value: string): string {
    return value.toLocaleLowerCase().replace(/[\W_]+/g, ' ').trim();
  }
}
