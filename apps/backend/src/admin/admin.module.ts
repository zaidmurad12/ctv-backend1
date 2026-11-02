import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { AdminController } from './admin.controller.js';
import { HomeSectionsAdminController, HomeSectionsAdminService } from './homeSectionsAdmin.js';
import { SourceCheckController, SourceCheckService } from './sourceCheck.js';
import { SourceLatestAdminController, SourceLatestController, SourceLatestService } from './sourceLatest.js';
import { TmdbLookupService } from './infrastructure/tmdbLookupService.js';
import { StreamProxyController } from './streamProxy.controller.js';
import { ArchiveOrgService } from './infrastructure/archiveOrgService.js';
import { AdminMoviesRepository } from './infrastructure/adminMoviesRepository.js';
import { AdminShowsRepository } from './infrastructure/adminShowsRepository.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { CinemanaBackfillService } from './infrastructure/cinemanaBackfillService.js';
import { MovieHashService } from './infrastructure/movieHashService.js';
import { OpenSubtitlesService } from './infrastructure/openSubtitlesService.js';
import { TmdbDiscoverService } from './infrastructure/tmdbDiscoverService.js';
import { TmdbImportService } from './infrastructure/tmdbImportService.js';
import {
  AdminDiscoverUseCases,
  AdminFeaturedUseCases,
  AdminMoviesUseCases,
  AdminShowsUseCases,
  AdminUsersUseCases,
  DashboardUseCases,
  ProvidersUseCases,
} from './useCases.js';

@Module({
  imports: [AuthModule, ProvidersModule, CatalogModule],
  controllers: [AdminController, StreamProxyController, HomeSectionsAdminController, SourceCheckController, SourceLatestController, SourceLatestAdminController],
  providers: [
    HomeSectionsAdminService,
    SourceCheckService,
    SourceLatestService,
    TmdbLookupService,
    AdminUsersUseCases,
    AdminMoviesUseCases,
    AdminShowsUseCases,
    AdminFeaturedUseCases,
    AdminDiscoverUseCases,
    DashboardUseCases,
    ProvidersUseCases,
    AdminMoviesRepository,
    AdminShowsRepository,
    DashboardStatsRepository,
    TmdbImportService,
    TmdbDiscoverService,
    OpenSubtitlesService,
    MovieHashService,
    CinemanaBackfillService,
    ArchiveOrgService,
  ],
})
export class AdminModule {}
