import type { Movie, TVShow, Season, Episode } from './entities/content.js';
import type { EntityId } from './types.js';

export interface MovieRepository {
  save(movie: Movie): Promise<void>;
  findById(id: EntityId): Promise<Movie | null>;
  findByTmdbId(id: string): Promise<Movie | null>;
  list(): Promise<Movie[]>;
}

export interface TVShowRepository {
  save(show: TVShow): Promise<void>;
  findById(id: EntityId): Promise<TVShow | null>;
  findByTmdbId(id: string): Promise<TVShow | null>;
  list(): Promise<TVShow[]>;
}

export interface SeasonRepository {
  save(season: Season): Promise<void>;
  findById(id: EntityId): Promise<Season | null>;
  findByShowId(showId: EntityId): Promise<Season[]>;
}

export interface EpisodeRepository {
  save(episode: Episode): Promise<void>;
  findById(id: EntityId): Promise<Episode | null>;
  findBySeasonId(seasonId: EntityId): Promise<Episode[]>;
}
