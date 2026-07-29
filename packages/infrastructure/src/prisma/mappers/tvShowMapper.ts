import type { Prisma, TVShow as PrismaTVShow } from '@prisma/client';
import type { MediaStatus } from '@ctv-platform/domain';
import { TVShow } from '@ctv-platform/domain';

const DOMAIN_TO_PRISMA_STATUS: Record<MediaStatus, PrismaTVShow['status']> = {
  draft: 'DRAFT',
  pending: 'PENDING',
  published: 'PUBLISHED',
  removed: 'REMOVED',
  inactive: 'INACTIVE',
};

const PRISMA_TO_DOMAIN_STATUS: Record<PrismaTVShow['status'], MediaStatus> = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  REMOVED: 'removed',
  INACTIVE: 'inactive',
};

/**
 * Translates between the persisted TVShow row and the TVShow aggregate.
 * This is the only place allowed to know both shapes.
 */
export class TVShowMapper {
  static toDomain(record: PrismaTVShow): TVShow {
    return TVShow.reconstitute({
      id: record.id,
      title: record.title,
      overview: record.overview,
      status: PRISMA_TO_DOMAIN_STATUS[record.status],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      seasonCount: record.numberOfSeasons,
      episodeCount: record.numberOfEpisodes,
    });
  }

  static toCreateInput(show: TVShow): Prisma.TVShowUncheckedCreateInput {
    return {
      id: show.id,
      title: show.title.value,
      overview: show.overview,
      status: DOMAIN_TO_PRISMA_STATUS[show.status],
      numberOfSeasons: show.seasonCount,
      numberOfEpisodes: show.episodeCount,
      createdAt: show.createdAt,
      updatedAt: show.updatedAt,
    };
  }

  static toUpdateInput(show: TVShow): Prisma.TVShowUncheckedUpdateInput {
    return {
      title: show.title.value,
      overview: show.overview,
      status: DOMAIN_TO_PRISMA_STATUS[show.status],
      numberOfSeasons: show.seasonCount,
      numberOfEpisodes: show.episodeCount,
      updatedAt: show.updatedAt,
    };
  }
}
