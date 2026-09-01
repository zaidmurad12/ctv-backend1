import { apiRequest } from '../lib/apiClient';
import type {
  MovieDetailDto,
  MovieSummaryDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from '../lib/types';

export const moviesService = {
  latest(): Promise<MovieSummaryDto[]> {
    return apiRequest<MovieSummaryDto[]>('movies/latest');
  },
  trending(): Promise<MovieSummaryDto[]> {
    return apiRequest<MovieSummaryDto[]>('movies/trending');
  },
  popular(): Promise<MovieSummaryDto[]> {
    return apiRequest<MovieSummaryDto[]>('movies/popular');
  },
  topRated(): Promise<MovieSummaryDto[]> {
    return apiRequest<MovieSummaryDto[]>('movies/top-rated');
  },
  recommended(): Promise<MovieSummaryDto[]> {
    return apiRequest<MovieSummaryDto[]>('movies/recommended');
  },
  getById(id: string): Promise<MovieDetailDto> {
    return apiRequest<MovieDetailDto>(`movies/${id}`);
  },
  streams(id: string): Promise<StreamResponseDto[]> {
    return apiRequest<StreamResponseDto[]>(`movies/${id}/streams`);
  },
  subtitles(id: string): Promise<SubtitleResponseDto[]> {
    return apiRequest<SubtitleResponseDto[]>(`movies/${id}/subtitles`);
  },
};
