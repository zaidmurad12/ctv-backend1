import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { MovieQueryRepository } from './infrastructure/movieQueryRepository.js';
import { ShowQueryRepository } from './infrastructure/showQueryRepository.js';
import {
  EpisodeQueryRepository,
  SeasonQueryRepository,
} from './infrastructure/seasonEpisodeQueryRepository.js';
import { MoviesController } from './movies.controller.js';
import { ShowsController } from './shows.controller.js';
import { EpisodesController, SeasonsController } from './seasonsEpisodes.controller.js';
import { EpisodesUseCases, MoviesUseCases, SeasonsUseCases, ShowsUseCases } from './useCases.js';

@Module({
  imports: [ProvidersModule],
  controllers: [MoviesController, ShowsController, SeasonsController, EpisodesController],
  providers: [
    MovieQueryRepository,
    ShowQueryRepository,
    SeasonQueryRepository,
    EpisodeQueryRepository,
    MoviesUseCases,
    ShowsUseCases,
    SeasonsUseCases,
    EpisodesUseCases,
  ],
  exports: [
    MovieQueryRepository,
    ShowQueryRepository,
    SeasonQueryRepository,
    EpisodeQueryRepository,
  ],
})
export class CatalogModule {}
