import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@ctv-platform/domain';
import { buildPaginationMeta, type PaginationMeta } from '../common/dto/pagination.dto.js';
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
  constructor(private readonly movies: MovieQueryRepository) {}

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

  async getById(id: string): Promise<MovieDetailDto> {
    const movie = await this.movies.findById(id);
    if (!movie) {
      throw new NotFoundError('Movie', id);
    }
    return movie;
  }

  async streams(id: string): Promise<StreamResponseDto[]> {
    await this.getById(id);
    return this.movies.listStreams(id);
  }

  async subtitles(id: string): Promise<SubtitleResponseDto[]> {
    await this.getById(id);
    return this.movies.listSubtitles(id);
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
  constructor(private readonly episodes: EpisodeQueryRepository) {}

  async getById(id: string): Promise<EpisodeDetailDto> {
    const episode = await this.episodes.findById(id);
    if (!episode) {
      throw new NotFoundError('Episode', id);
    }
    return episode;
  }

  async streams(id: string): Promise<StreamResponseDto[]> {
    await this.getById(id);
    return this.episodes.listStreams(id);
  }

  async subtitles(id: string): Promise<SubtitleResponseDto[]> {
    await this.getById(id);
    return this.episodes.listSubtitles(id);
  }
}
