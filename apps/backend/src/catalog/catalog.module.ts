import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { OpenSubtitlesService } from '../admin/infrastructure/openSubtitlesService.js';
import { MovieQueryRepository } from './infrastructure/movieQueryRepository.js';
import { ShowQueryRepository } from './infrastructure/showQueryRepository.js';
import {
  EpisodeQueryRepository,
  SeasonQueryRepository,
} from './infrastructure/seasonEpisodeQueryRepository.js';
import { MoviesController } from './movies.controller.js';
import { ShowsController } from './shows.controller.js';
import { EpisodesController, SeasonsController } from './seasonsEpisodes.controller.js';
import { PeopleController } from './people.controller.js';
import { PersonQueryRepository } from './infrastructure/personQueryRepository.js';
import { SubtitlesController } from './subtitles.controller.js';
import { HomeSectionsController, HomeSectionsUseCases } from './homeSections.js';
import {
  EpisodesUseCases,
  MoviesUseCases,
  PeopleUseCases,
  SeasonsUseCases,
  ShowsUseCases,
} from './useCases.js';

@Module({
  imports: [ProvidersModule],
  controllers: [
    MoviesController,
    HomeSectionsController,
    ShowsController,
    SeasonsController,
    EpisodesController,
    SubtitlesController,
    PeopleController,
  ],
  providers: [
    MovieQueryRepository,
    HomeSectionsUseCases,
    ShowQueryRepository,
    SeasonQueryRepository,
    EpisodeQueryRepository,
    PersonQueryRepository,
    MoviesUseCases,
    ShowsUseCases,
    SeasonsUseCases,
    EpisodesUseCases,
    PeopleUseCases,
    OpenSubtitlesService,
  ],
  exports: [
    HomeSectionsUseCases,
    MovieQueryRepository,
    ShowQueryRepository,
    SeasonQueryRepository,
    EpisodeQueryRepository,
  ],
})
export class CatalogModule {}
