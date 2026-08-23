import { apiRequest } from './apiClient';
import type { ProviderHealthSummaryDto, ProviderSummaryDto } from './types';

export const providersService = {
  list(): Promise<ProviderSummaryDto[]> {
    return apiRequest<ProviderSummaryDto[]>('admin/providers');
  },

  health(): Promise<ProviderHealthSummaryDto[]> {
    return apiRequest<ProviderHealthSummaryDto[]>('admin/providers/health');
  },

  triggerDiscovery(providerId: string): Promise<{ discovered: number }> {
    return apiRequest<{ discovered: number }>(`admin/providers/${providerId}/discover`, {
      method: 'POST',
    });
  },

  enable(providerId: string): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/enable`, { method: 'POST' });
  },

  disable(providerId: string): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/disable`, { method: 'POST' });
  },

  reload(providerId: string): Promise<ProviderHealthSummaryDto> {
    return apiRequest<ProviderHealthSummaryDto>(`admin/providers/${providerId}/reload`, {
      method: 'POST',
    });
  },

  updatePriority(providerId: string, priority: number): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/priority`, {
      method: 'PATCH',
      body: { priority },
    });
  },
};
