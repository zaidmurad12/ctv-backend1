import { BadRequestException, Injectable } from '@nestjs/common';
import type { HistoryResponseDto, RecordHistoryDto } from './dto.js';
import { WatchHistoryRepository } from './infrastructure/watchHistoryRepository.js';

@Injectable()
export class WatchHistoryUseCases {
  constructor(private readonly history: WatchHistoryRepository) {}

  async record(userId: string, dto: RecordHistoryDto): Promise<string> {
    if (Boolean(dto.movieId) === Boolean(dto.episodeId)) {
      throw new BadRequestException('Provide exactly one of movieId or episodeId.');
    }
    return this.history.record(userId, dto.movieId, dto.episodeId, dto.position, dto.duration);
  }

  list(userId: string): Promise<HistoryResponseDto[]> {
    return this.history.list(userId, 50);
  }

  clear(userId: string): Promise<void> {
    return this.history.clear(userId);
  }
}
