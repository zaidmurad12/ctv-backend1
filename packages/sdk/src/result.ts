import type { Result } from '@ctv-platform/domain';
import type { ProviderError } from './errors.js';

/**
 * Every provider operation resolves to this type instead of throwing.
 * Build values with `ok`/`err` from `@ctv-platform/domain`.
 */
export type ProviderResult<T> = Result<T, ProviderError>;
