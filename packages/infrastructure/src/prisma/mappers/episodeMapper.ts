import type { Prisma, Episode as PrismaEpisode } from '@prisma/client';
import { Episode } from '@ctv-platform/domain';

/**
 * The Episode table has no status column: availability is expressed through its
 * Streams instead. Every row that exists is treated as published for the domain.
 */
const PERSISTED_EPISODE_STATUS = 'published' as const;

/**
 * Translates between the persisted Episode row and the Episode aggregate.
 * This is the only place allowed to know both shapes.
 */
export class EpisodeMapper {
  static toDomain(record: PrismaEpisode): Episode {
    return Episode.reconstitute({
      id: record.id,
      seasonId: record.seasonId,
      episodeNumber: record.episodeNumber,
      title: record.title,
      overview: record.overview,
      status: PERSISTED_EPISODE_STATUS,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      runtimeMinutes: record.runtime,
    });
  }

  static toCreateInput(episode: Episode): Prisma.EpisodeUncheckedCreateInput {
    return {
      id: episode.id,
      seasonId: episode.seasonId,
      episodeNumber: episode.episodeNumber,
      title: episode.title.value,
      overview: episode.overview,
      runtime: episode.runtime?.minutes ?? null,
      createdAt: episode.createdAt,
      updatedAt: episode.updatedAt,
    };
  }

  static toUpdateInput(episode: Episode): Prisma.EpisodeUncheckedUpdateInput {
    return {
      title: episode.title.value,
      overview: episode.overview,
      runtime: episode.runtime?.minutes ?? null,
      updatedAt: episode.updatedAt,
    };
  }
}
