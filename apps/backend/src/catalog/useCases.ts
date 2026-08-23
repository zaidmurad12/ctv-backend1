import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@ctv-platform/domain';
import { buildPaginationMeta, type PaginationMeta } from '../common/dto/pagination.dto.js';
import { ProviderStreamResolver } from '../providers/providerStreamResolver.js';
import type { CatalogListQueryDto } from './dto.js';
import type {
  EpisodeDetailDto,
  EpisodeSummaryDto,
  MovieDetailDto,
  MovieSummaryDto,
  SeasonDetailDto,
  SeasonSummaryDto,
  ShowDetailDto,
  ShowSummaryDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from './dto.js';
import {
  EpisodeQueryRepository,
  SeasonQueryRepository,
} from './infrastructure/seasonEpisodeQueryRepository.js';
import { MovieQueryRepository } from './infrastructure/movieQueryRepository.js';
import { ShowQueryRepository } from './infrastructure/showQueryRepository.js';

export interface Page<T> {
  readonly items: T[];
  readonly meta: PaginationMeta;
}

function toPage<T>(items: T[], total: number, query: CatalogListQueryDto): Page<T> {
  return { items, meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total) };
}

@Injectable()
export class MoviesUseCases {
  constructor(
    private readonly movies: MovieQueryRepository,
    private readonly streamResolver: ProviderStreamResolver,
  ) {}

  async list(query: CatalogListQueryDto): Promise<Page<MovieSummaryDto>> {
    const { items, total } = await this.movies.list(query);
    return toPage(items, total, query);
  }

  async listBySort(
    sort: 'newest' | 'popularity' | 'rating',
    limit: number,
  ): Promise<MovieSummaryDto[]> {
    const { items } = await this.movies.list({ sort, limit, page: 1 });
    return items;
  }

  /** specification: "Top Rated" — highest rated among movies with a meaningful vote count. */
  async topRated(limit: number): Promise<MovieSummaryDto[]> {
    const { items } = await this.movies.list({ sort: 'rating', limit, page: 1, minVotes: 50 });
    return items;
  }

  async recommended(userId: string, limit: number): Promise<MovieSummaryDto[]> {
    return this.movies.recommended(userId, limit);
  }

  async getById(id: string): Promise<MovieDetailDto> {
    const movie = await this.movies.findById(id);
    if (!movie) {
      throw new NotFoundError('Movie', id);
    }
    return movie;
  }

  /**
   * DB-stored streams (pre-imported by a future batch/import provider) win
   * when present; otherwise falls back to live, on-demand resolution from
   * whichever registered provider (e.g. Consumet) has them. See
   * `ProviderStreamResolver` for the failover/caching behavior.
   */
  async streams(id: string): Promise<StreamResponseDto[]> {
    const movie = await this.getById(id);
    const dbStreams = await this.movies.listStreams(id);
    if (dbStreams.length > 0) {
      return dbStreams;
    }
    return this.streamResolver.resolveMovieStreams({ id: movie.id, title: movie.title });
  }

  async subtitles(id: string): Promise<SubtitleResponseDto[]> {
    const movie = await this.getById(id);
    const dbSubtitles = await this.movies.listSubtitles(id);
    if (dbSubtitles.length > 0) {
      return dbSubtitles;
    }
    return this.streamResolver.resolveMovieSubtitles({ id: movie.id, title: movie.title });
  }
}

@Injectable()
export class ShowsUseCases {
  constructor(
    private readonly shows: ShowQueryRepository,
    private readonly seasonsRepository: SeasonQueryRepository,
  ) {}

  async list(query: CatalogListQueryDto): Promise<Page<ShowSummaryDto>> {
    const { items, total } = await this.shows.list(query);
    return toPage(items, total, query);
  }

  async listBySort(
    sort: 'newest' | 'popularity' | 'rating',
    limit: number,
  ): Promise<ShowSummaryDto[]> {
    const { items } = await this.shows.list({ sort, limit, page: 1 });
    return items;
  }

  async topRated(limit: number): Promise<ShowSummaryDto[]> {
    const { items } = await this.shows.list({ sort: 'rating', limit, page: 1, minVotes: 50 });
    return items;
  }

  async getById(id: string): Promise<ShowDetailDto> {
    const show = await this.shows.findById(id);
    if (!show) {
      throw new NotFoundError('TVShow', id);
    }
    return show;
  }

  async seasons(id: string): Promise<SeasonSummaryDto[]> {
    await this.getById(id);
    return this.shows.listSeasons(id);
  }

  async episodes(id: string): Promise<EpisodeSummaryDto[]> {
    const show = await this.getById(id);
    const episodeLists = await Promise.all(
      show.seasons.map((season) => this.seasonsRepository.listEpisodes(season.id)),
    );
    return episodeLists.flat();
  }
}

@Injectable()
export class SeasonsUseCases {
  constructor(private readonly seasons: SeasonQueryRepository) {}

  async getById(id: string): Promise<SeasonDetailDto> {
    const season = await this.seasons.findById(id);
    if (!season) {
      throw new NotFoundError('Season', id);
    }
    return season;
  }

  async episodes(id: string): Promise<EpisodeSummaryDto[]> {
    await this.getById(id);
    return this.seasons.listEpisodes(id);
  }
}

@Injectable()
export class EpisodesUseCases {
  constructor(
    private readonly episodes: EpisodeQueryRepository,
    private readonly streamResolver: ProviderStreamResolver,
  ) {}

  async getById(id: string): Promise<EpisodeDetailDto> {
    const episode = await this.episodes.findById(id);
    if (!episode) {
      throw new NotFoundError('Episode', id);
    }
    return episode;
  }

  async streams(id: string): Promise<StreamResponseDto[]> {
    await this.getById(id);
    const dbStreams = await this.episodes.listStreams(id);
    if (dbStreams.length > 0) {
      return dbStreams;
    }
    const context = await this.episodes.findResolutionContext(id);
    if (!context) {
      return [];
    }
    return this.streamResolver.resolveEpisodeStreams({ id, ...context });
  }

  async subtitles(id: string): Promise<SubtitleResponseDto[]> {
    await this.getById(id);
    const dbSubtitles = await this.episodes.listSubtitles(id);
    if (dbSubtitles.length > 0) {
      return dbSubtitles;
    }
    const context = await this.episodes.findResolutionContext(id);
    if (!context) {
      return [];
    }
    return this.streamResolver.resolveEpisodeSubtitles({ id, ...context });
  }
}
