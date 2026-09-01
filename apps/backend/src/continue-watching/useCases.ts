import { BadRequestException, Injectable } from '@nestjs/common';
import type { ContinueWatchingResponseDto, UpsertContinueWatchingDto } from './dto.js';
import { ContinueWatchingRepository } from './infrastructure/continueWatchingRepository.js';

@Injectable()
export class ContinueWatchingUseCases {
  constructor(private readonly continueWatching: ContinueWatchingRepository) {}

  async upsert(userId: string, dto: UpsertContinueWatchingDto): Promise<string> {
    if (Boolean(dto.movieId) === Boolean(dto.episodeId)) {
      throw new BadRequestException('Provide exactly one of movieId or episodeId.');
    }
    return this.continueWatching.upsert(userId, dto.movieId, dto.episodeId, dto.position);
  }

  list(userId: string): Promise<ContinueWatchingResponseDto[]> {
    return this.continueWatching.list(userId);
  }
}
