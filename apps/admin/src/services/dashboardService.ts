import { apiRequest } from './apiClient';
import type { DashboardStatisticsDto } from './types';

export const dashboardService = {
  getStatistics(): Promise<DashboardStatisticsDto> {
    return apiRequest<DashboardStatisticsDto>('admin/dashboard/statistics');
  },
};
