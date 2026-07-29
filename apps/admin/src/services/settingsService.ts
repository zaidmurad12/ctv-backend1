import { apiRequest } from './apiClient';

/**
 * Typed contract for `specification/11-Admin-Dashboard.md.txt` "Settings".
 * apps/backend (Milestone 5) has no Settings API or `Setting` repository
 * wired up yet, even though the Prisma schema has a `Setting` table. These
 * calls hit the namespace a future endpoint would use and 404 until then.
 */
export interface GeneralSettingsDto {
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly defaultLanguage: string;
  readonly defaultTheme: 'light' | 'dark';
}

export interface ProviderSettingsDto {
  readonly enableProviders: boolean;
  readonly providerPriority: string[];
  readonly retryPolicy: string;
  readonly timeoutMs: number;
}

export interface ImportSettingsDto {
  readonly maximumConcurrentJobs: number;
  readonly maximumRetries: number;
  readonly synchronizationSchedule: string;
  readonly metadataRefreshIntervalMinutes: number;
}

export interface PlayerSettingsDto {
  readonly defaultSubtitle: string;
  readonly defaultQuality: string;
  readonly defaultAudio: string;
  readonly resumePlayback: boolean;
}

export interface SearchSettingsDto {
  readonly minimumCharacters: number;
  readonly maximumResults: number;
  readonly cacheDurationSeconds: number;
  readonly trendingCount: number;
}

export interface ApplicationSettingsDto {
  readonly general: GeneralSettingsDto;
  readonly providers: ProviderSettingsDto;
  readonly import: ImportSettingsDto;
  readonly player: PlayerSettingsDto;
  readonly search: SearchSettingsDto;
}

export const settingsService = {
  get(): Promise<ApplicationSettingsDto> {
    return apiRequest<ApplicationSettingsDto>('admin/settings');
  },

  update(payload: Partial<ApplicationSettingsDto>): Promise<ApplicationSettingsDto> {
    return apiRequest<ApplicationSettingsDto>('admin/settings', { method: 'PATCH', body: payload });
  },
};
