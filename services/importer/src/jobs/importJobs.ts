import type { DiscoveryModeEnum, ImportPriorityEnum } from '../enums.js';
import type { ImportableCategory } from '../types.js';

export interface DiscoveryJobPayload {
  readonly providerId: string;
  readonly mode: DiscoveryModeEnum;
}

export interface ImportContentJobPayload {
  readonly providerId: string;
  readonly providerContentId: string;
  readonly category: ImportableCategory;
  readonly priority: ImportPriorityEnum;
  readonly attempt: number;
}
