import { DomainError, type Result } from '@ctv-platform/domain';
import type { ImportFailureCategoryEnum } from './enums.js';

/**
 * The only error shape a pipeline stage is allowed to surface. Mirrors
 * `ProviderError` from the SDK at a different layer: this classifies why a
 * whole import stage/job failed, not a single provider HTTP call.
 */
export class ImportError extends DomainError {
  readonly category: ImportFailureCategoryEnum;
  readonly stage: string;

  constructor(
    category: ImportFailureCategoryEnum,
    stage: string,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ImportError';
    this.category = category;
    this.stage = stage;
  }
}

/** Every pipeline stage resolves to this instead of throwing. */
export type ImportResult<T> = Result<T, ImportError>;
