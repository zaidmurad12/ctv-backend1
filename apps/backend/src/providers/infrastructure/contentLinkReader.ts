import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';

/**
 * Read-only complement to `@ctv-platform/importer`'s `ContentProviderLinkPort`
 * (which only exposes the reverse external-id -> internal-id lookup used by
 * the import pipeline). `ProviderStreamResolver` needs the forward direction
 * — "does movie/episode X already have a stored external id for provider Y"
 * — so it can skip re-searching on every cache miss. Kept small and
 * dedicated rather than extending the shared importer port, so that package
 * (and its other consumers) stay untouched.
 */
@Injectable()
export class ContentLinkReader {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async findMovieExternalId(movieId: string, providerDbId: string): Promise<string | null> {
    const link = await this.prisma.movieProvider.findUnique({
      where: { movieId_providerId: { movieId, providerId: providerDbId } },
    });
    return link?.externalId ?? null;
  }

  async findEpisodeExternalId(episodeId: string, providerDbId: string): Promise<string | null> {
    const link = await this.prisma.episodeProvider.findUnique({
      where: { episodeId_providerId: { episodeId, providerId: providerDbId } },
    });
    return link?.externalId ?? null;
  }
}
