import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import type { ContentProviderLinkPort } from './ports.js';

/**
 * Prisma-backed adapter for the `Provider`, `MovieProvider`, and
 * `EpisodeProvider` tables. This is the primary duplicate-protection key per
 * specification/08-Import-Pipeline.md.txt ("Provider ID: Unique"): a content
 * item is the *same* movie/episode in our database if, and only if, a join
 * row already exists for (provider, externalId) — independent of TMDB/IMDb
 * matching, which is a separate metadata-enrichment concern.
 */
export class PrismaContentProviderLinkRepository implements ContentProviderLinkPort {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async ensureProvider(providerId: string, providerName: string): Promise<string> {
    const provider = await this.prisma.provider.upsert({
      where: { slug: providerId },
      create: { slug: providerId, name: providerName, version: '1.0.0' },
      update: { name: providerName },
    });
    return provider.id;
  }

  async findMovieIdByExternalId(providerDbId: string, externalId: string): Promise<string | null> {
    const link = await this.prisma.movieProvider.findFirst({
      where: { providerId: providerDbId, externalId },
    });
    return link?.movieId ?? null;
  }

  async ensureMovieLink(
    movieId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string> {
    const link = await this.prisma.movieProvider.upsert({
      where: { movieId_providerId: { movieId, providerId: providerDbId } },
      create: { movieId, providerId: providerDbId, externalId, sourceTitle },
      update: { externalId, sourceTitle },
    });
    return link.id;
  }

  async findEpisodeIdByExternalId(
    providerDbId: string,
    externalId: string,
  ): Promise<string | null> {
    const link = await this.prisma.episodeProvider.findFirst({
      where: { providerId: providerDbId, externalId },
    });
    return link?.episodeId ?? null;
  }

  async ensureEpisodeLink(
    episodeId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string> {
    const link = await this.prisma.episodeProvider.upsert({
      where: { episodeId_providerId: { episodeId, providerId: providerDbId } },
      create: { episodeId, providerId: providerDbId, externalId, sourceTitle },
      update: { externalId, sourceTitle },
    });
    return link.id;
  }

  async findShowIdByExternalId(providerDbId: string, externalId: string): Promise<string | null> {
    const link = await this.prisma.tVShowProvider.findFirst({
      where: { providerId: providerDbId, externalId },
    });
    return link?.showId ?? null;
  }

  async ensureShowLink(
    showId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string> {
    const link = await this.prisma.tVShowProvider.upsert({
      where: { showId_providerId: { showId, providerId: providerDbId } },
      create: { showId, providerId: providerDbId, externalId, sourceTitle },
      update: { externalId, sourceTitle },
    });
    return link.id;
  }
}
