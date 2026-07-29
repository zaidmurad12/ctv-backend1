import { apiRequest } from './apiClient';

/**
 * Typed contract for `specification/11-Admin-Dashboard.md.txt` "Synchronization".
 * The only real, wired-up equivalent in apps/backend (Milestone 5) is
 * `POST /admin/providers/:id/discover` (manual discovery run), exposed via
 * {@link providersService.triggerDiscovery}. Full/incremental sync control,
 * queue-size/estimated-time reporting, and refresh-artwork/streams/subtitles/
 * validate-library actions have no backend endpoint yet — these calls hit the
 * namespace a future endpoint would use and 404 until then.
 */
export interface SynchronizationStatusDto {
  readonly currentJobId?: string | null;
  readonly progress: number;
  readonly queueSize: number;
  readonly estimatedSecondsRemaining?: number | null;
  readonly completed: number;
  readonly failed: number;
}

export const synchronizationService = {
  getStatus(): Promise<SynchronizationStatusDto> {
    return apiRequest<SynchronizationStatusDto>('admin/synchronization/status');
  },

  startFullSync(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/full', { method: 'POST' });
  },

  startIncrementalSync(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/incremental', { method: 'POST' });
  },

  refreshMetadata(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/refresh-metadata', {
      method: 'POST',
    });
  },

  refreshArtwork(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/refresh-artwork', {
      method: 'POST',
    });
  },

  refreshStreams(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/refresh-streams', {
      method: 'POST',
    });
  },

  refreshSubtitles(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/refresh-subtitles', {
      method: 'POST',
    });
  },

  validateLibrary(): Promise<{ jobId: string }> {
    return apiRequest<{ jobId: string }>('admin/synchronization/validate', { method: 'POST' });
  },
};
