import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { AdminController } from './admin.controller.js';
import { StreamProxyController } from './streamProxy.controller.js';
import { ArchiveOrgService } from './infrastructure/archiveOrgService.js';
import { AdminMoviesRepository } from './infrastructure/adminMoviesRepository.js';
import { AdminShowsRepository } from './infrastructure/adminShowsRepository.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { AudioSyncAnalysisService } from './infrastructure/audioSyncAnalysisService.js';
import { MovieHashService } from './infrastructure/movieHashService.js';
import { OpenSubtitlesService } from './infrastructure/openSubtitlesService.js';
import { SyncIssueRepository } from '../catalog/infrastructure/syncIssueRepository.js';
import { TmdbDiscoverService } from './infrastructure/tmdbDiscoverService.js';
import { TmdbImportService } from './infrastructure/tmdbImportService.js';
import {
  AdminDiscoverUseCases,
  AdminFeaturedUseCases,
  AdminMoviesUseCases,
  AdminShowsUseCases,
  AdminSyncIssuesUseCases,
  AdminUsersUseCases,
  DashboardUseCases,
  ProvidersUseCases,
} from './useCases.js';

@Module({
  imports: [AuthModule, ProvidersModule],
  controllers: [AdminController, StreamProxyController],
  providers: [
    AdminUsersUseCases,
    AdminMoviesUseCases,
    AdminShowsUseCases,
    AdminFeaturedUseCases,
    AdminDiscoverUseCases,
    AdminSyncIssuesUseCases,
    DashboardUseCases,
    ProvidersUseCases,
    AdminMoviesRepository,
    AdminShowsRepository,
    DashboardStatsRepository,
    TmdbImportService,
    TmdbDiscoverService,
    OpenSubtitlesService,
    MovieHashService,
    SyncIssueRepository,
    AudioSyncAnalysisService,
    ArchiveOrgService,
  ],
})
export class AdminModule {}
