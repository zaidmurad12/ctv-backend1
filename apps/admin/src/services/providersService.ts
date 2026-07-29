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

  /**
   * Enable/disable/reload have no backend endpoint yet — apps/backend's
   * `ProviderRegistry` (Milestone 5) exposes list/health/discover only. These
   * hit the namespace a future endpoint would use and 404 until then.
   */
  enable(providerId: string): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/enable`, { method: 'POST' });
  },

  disable(providerId: string): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/disable`, { method: 'POST' });
  },

  reload(providerId: string): Promise<void> {
    return apiRequest<void>(`admin/providers/${providerId}/reload`, { method: 'POST' });
  },
};
