import type { Movie, TVShow, Season, Episode } from '@ctv-platform/domain';
import type { MovieRepository, TVShowRepository, SeasonRepository, EpisodeRepository } from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from './client.js';

export class PrismaMovieRepository implements MovieRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(movie: Movie): Promise<void> {
    await this.prisma.movie.upsert({
      where: { id: movie.id },
      create: {
        id: movie.id,
        title: movie.title.value,
        overview: movie.overview ?? null,
        status: 'PENDING',
      },
      update: {
        title: movie.title.value,
        overview: movie.overview ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<Movie | null> {
    const entity = await this.prisma.movie.findUnique({ where: { id } });
    return entity ? null : null;
  }

  async findByTmdbId(id: string): Promise<Movie | null> {
    const entity = await this.prisma.movie.findUnique({ where: { tmdbId: id } });
    return entity ? null : null;
  }

  async list(): Promise<Movie[]> {
    return [];
  }
}

export class PrismaTVShowRepository implements TVShowRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(show: TVShow): Promise<void> {
    await this.prisma.tVShow.upsert({
      where: { id: show.id },
      create: {
        id: show.id,
        title: show.title.value,
        overview: show.overview ?? null,
        status: 'PENDING',
      },
      update: {
        title: show.title.value,
        overview: show.overview ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<TVShow | null> {
    return null;
  }

  async findByTmdbId(id: string): Promise<TVShow | null> {
    return null;
  }

  async list(): Promise<TVShow[]> {
    return [];
  }
}

export class PrismaSeasonRepository implements SeasonRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(season: Season): Promise<void> {
    await this.prisma.season.upsert({
      where: { id: season.id },
      create: {
        id: season.id,
        showId: season.showId,
        seasonNumber: season.seasonNumber,
        name: season.title?.value ?? null,
        overview: season.overview ?? null,
      },
      update: {
        name: season.title?.value ?? null,
        overview: season.overview ?? null,
      },
    });
  }

  async findById(id: string): Promise<Season | null> {
    return null;
  }

  async findByShowId(showId: string): Promise<Season[]> {
    return [];
  }
}

export class PrismaEpisodeRepository implements EpisodeRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(episode: Episode): Promise<void> {
    await this.prisma.episode.upsert({
      where: { id: episode.id },
      create: {
        id: episode.id,
        seasonId: episode.seasonId,
        episodeNumber: episode.episodeNumber,
        title: episode.title.value,
        overview: episode.overview ?? null,
      },
      update: {
        title: episode.title.value,
        overview: episode.overview ?? null,
      },
    });
  }

  async findById(id: string): Promise<Episode | null> {
    return null;
  }

  async findBySeasonId(seasonId: string): Promise<Episode[]> {
    return [];
  }
}
