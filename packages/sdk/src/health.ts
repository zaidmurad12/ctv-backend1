import type { ProviderStatusEnum } from './enums.js';

export interface ProviderHealth {
  readonly status: ProviderStatusEnum;
  readonly latencyMs: number;
  readonly version: string;
  readonly checkedAt: Date;
  readonly message?: string;
}
