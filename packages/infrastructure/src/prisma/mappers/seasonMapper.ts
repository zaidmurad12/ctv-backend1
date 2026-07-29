import type { Prisma, Season as PrismaSeason } from '@prisma/client';
import { Season } from '@ctv-platform/domain';

/**
 * Translates between the persisted Season row and the Season aggregate.
 * This is the only place allowed to know both shapes.
 */
export class SeasonMapper {
  static toDomain(record: PrismaSeason): Season {
    return Season.reconstitute({
      id: record.id,
      showId: record.showId,
      seasonNumber: record.seasonNumber,
      title: record.name,
      overview: record.overview,
      episodeCount: record.episodeCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  static toCreateInput(season: Season): Prisma.SeasonUncheckedCreateInput {
    return {
      id: season.id,
      showId: season.showId,
      seasonNumber: season.seasonNumber,
      name: season.title?.value ?? null,
      overview: season.overview,
      episodeCount: season.episodeCount,
      createdAt: season.createdAt,
      updatedAt: season.updatedAt,
    };
  }

  static toUpdateInput(season: Season): Prisma.SeasonUncheckedUpdateInput {
    return {
      name: season.title?.value ?? null,
      overview: season.overview,
      episodeCount: season.episodeCount,
      updatedAt: season.updatedAt,
    };
  }
}
