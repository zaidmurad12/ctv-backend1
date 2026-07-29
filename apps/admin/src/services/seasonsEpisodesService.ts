import { apiRequest } from './apiClient';
import type {
  EpisodeDetailDto,
  EpisodeSummaryDto,
  SeasonDetailDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from './types';

export const seasonsService = {
  getById(id: string): Promise<SeasonDetailDto> {
    return apiRequest<SeasonDetailDto>(`seasons/${id}`);
  },

  listEpisodes(id: string): Promise<EpisodeSummaryDto[]> {
    return apiRequest<EpisodeSummaryDto[]>(`seasons/${id}/episodes`);
  },
};

export const episodesService = {
  getById(id: string): Promise<EpisodeDetailDto> {
    return apiRequest<EpisodeDetailDto>(`episodes/${id}`);
  },

  listStreams(id: string): Promise<StreamResponseDto[]> {
    return apiRequest<StreamResponseDto[]>(`episodes/${id}/streams`);
  },

  listSubtitles(id: string): Promise<SubtitleResponseDto[]> {
    return apiRequest<SubtitleResponseDto[]>(`episodes/${id}/subtitles`);
  },
};
