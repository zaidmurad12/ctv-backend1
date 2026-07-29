import { Module } from '@nestjs/common';
import { ContinueWatchingRepository } from './infrastructure/continueWatchingRepository.js';
import { ContinueWatchingController } from './continueWatching.controller.js';
import { ContinueWatchingUseCases } from './useCases.js';

@Module({
  controllers: [ContinueWatchingController],
  providers: [ContinueWatchingRepository, ContinueWatchingUseCases],
})
export class ContinueWatchingModule {}
