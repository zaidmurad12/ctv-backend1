import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { AdminController } from './admin.controller.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { AdminUsersUseCases, DashboardUseCases, ProvidersUseCases } from './useCases.js';

@Module({
  imports: [AuthModule, ProvidersModule],
  controllers: [AdminController],
  providers: [AdminUsersUseCases, DashboardUseCases, ProvidersUseCases, DashboardStatsRepository],
})
export class AdminModule {}
