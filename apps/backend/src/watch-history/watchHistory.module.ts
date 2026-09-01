import { Module } from '@nestjs/common';
import { WatchHistoryRepository } from './infrastructure/watchHistoryRepository.js';
import { WatchHistoryController } from './watchHistory.controller.js';
import { WatchHistoryUseCases } from './useCases.js';

@Module({
  controllers: [WatchHistoryController],
  providers: [WatchHistoryRepository, WatchHistoryUseCases],
})
export class WatchHistoryModule {}
