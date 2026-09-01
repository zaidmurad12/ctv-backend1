import type { Prisma, Movie as PrismaMovie } from '@prisma/client';
import type { MediaStatus } from '@ctv-platform/domain';
import { Movie } from '@ctv-platform/domain';

const DOMAIN_TO_PRISMA_STATUS: Record<MediaStatus, PrismaMovie['status']> = {
  draft: 'DRAFT',
  pending: 'PENDING',
  published: 'PUBLISHED',
  removed: 'REMOVED',
  inactive: 'INACTIVE',
};

const PRISMA_TO_DOMAIN_STATUS: Record<PrismaMovie['status'], MediaStatus> = {
  DRAFT: 'draft',
  PENDING: 'pending',
  PUBLISHED: 'published',
  REMOVED: 'removed',
  INACTIVE: 'inactive',
};

/**
 * Translates between the persisted Movie row and the Movie aggregate.
 * This is the only place allowed to know both shapes.
 */
export class MovieMapper {
  static toDomain(record: PrismaMovie): Movie {
    return Movie.reconstitute({
      id: record.id,
      title: record.title,
      overview: record.overview,
      status: PRISMA_TO_DOMAIN_STATUS[record.status],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      runtimeMinutes: record.runtime,
      rating: record.rating === null ? null : Number(record.rating),
      trailerUrl: record.trailer,
    });
  }

  static toCreateInput(movie: Movie): Prisma.MovieUncheckedCreateInput {
    return {
      id: movie.id,
      title: movie.title.value,
      overview: movie.overview,
      status: DOMAIN_TO_PRISMA_STATUS[movie.status],
      runtime: movie.runtime?.minutes ?? null,
      rating: movie.rating?.value ?? null,
      trailer: movie.trailerUrl?.value ?? null,
      createdAt: movie.createdAt,
      updatedAt: movie.updatedAt,
    };
  }

  static toUpdateInput(movie: Movie): Prisma.MovieUncheckedUpdateInput {
    return {
      title: movie.title.value,
      overview: movie.overview,
      status: DOMAIN_TO_PRISMA_STATUS[movie.status],
      runtime: movie.runtime?.minutes ?? null,
      rating: movie.rating?.value ?? null,
      trailer: movie.trailerUrl?.value ?? null,
      updatedAt: movie.updatedAt,
    };
  }
}
