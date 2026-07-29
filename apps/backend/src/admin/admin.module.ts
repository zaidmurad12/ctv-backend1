import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { ProvidersRuntime } from './infrastructure/providersRuntime.js';
import { AdminUsersUseCases, DashboardUseCases, ProvidersUseCases } from './useCases.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminUsersUseCases,
    DashboardUseCases,
    ProvidersUseCases,
    DashboardStatsRepository,
    ProvidersRuntime,
  ],
})
export class AdminModule {}
