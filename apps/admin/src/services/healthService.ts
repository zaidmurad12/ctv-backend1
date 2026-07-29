import { apiRequest } from './apiClient';
import type { HealthDto } from './types';

export const healthService = {
  check(): Promise<HealthDto> {
    return apiRequest<HealthDto>('health', { skipAuth: true });
  },
};
