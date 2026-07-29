import { apiRequestWithMeta } from './apiClient';
import type { ListParams, Page } from './types';

/**
 * Typed contract for `specification/11-Admin-Dashboard.md.txt` "Import Jobs".
 * apps/backend (Milestone 5) does not persist import job history yet — the
 * importer's `ImportMetrics`/`ImportLogger` (services/importer) are
 * in-process only and have no REST surface. These calls hit the namespace a
 * future backend endpoint would use; until then they 404 and the page shows
 * an empty state rather than fabricated data.
 */
export interface ImportJobDto {
  readonly id: string;
  readonly providerId: string;
  readonly startedAt: string;
  readonly finishedAt?: string | null;
  readonly durationMs?: number | null;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly progress: number;
  readonly errors: number;
  readonly retries: number;
}

export const importJobsService = {
  async list(params: ListParams): Promise<Page<ImportJobDto>> {
    const { data, meta } = await apiRequestWithMeta<ImportJobDto[]>('admin/import-jobs', {
      params,
    });
    return { items: data, meta: meta! };
  },

  retry(jobId: string): Promise<ImportJobDto> {
    return apiRequestWithMeta<ImportJobDto>(`admin/import-jobs/${jobId}/retry`, {
      method: 'POST',
    }).then((r) => r.data);
  },

  cancel(jobId: string): Promise<ImportJobDto> {
    return apiRequestWithMeta<ImportJobDto>(`admin/import-jobs/${jobId}/cancel`, {
      method: 'POST',
    }).then((r) => r.data);
  },

  restart(jobId: string): Promise<ImportJobDto> {
    return apiRequestWithMeta<ImportJobDto>(`admin/import-jobs/${jobId}/restart`, {
      method: 'POST',
    }).then((r) => r.data);
  },
};
