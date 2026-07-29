import { DomainError } from '@ctv-platform/domain';
import type { ProviderErrorCodeEnum } from './enums.js';

/**
 * The only error shape a provider is allowed to surface. Providers never
 * throw raw HTTP/network errors; adapters translate transport failures into
 * one of these codes before returning a `ProviderResult`.
 */
export class ProviderError extends DomainError {
  readonly code: ProviderErrorCodeEnum;
  readonly providerId: string;
  readonly retryAfterMs: number | null;

  constructor(
    code: ProviderErrorCodeEnum,
    providerId: string,
    message: string,
    options?: { readonly cause?: unknown; readonly retryAfterMs?: number },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ProviderError';
    this.code = code;
    this.providerId = providerId;
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }
}

/** Thrown when registering a provider id that is already registered. */
export class ProviderAlreadyRegisteredError extends DomainError {
  constructor(providerId: string) {
    super(`Provider "${providerId}" is already registered.`);
    this.name = 'ProviderAlreadyRegisteredError';
  }
}

/** Thrown when resolving a provider id that has no registration. */
export class ProviderNotRegisteredError extends DomainError {
  constructor(providerId: string) {
    super(`Provider "${providerId}" is not registered.`);
    this.name = 'ProviderNotRegisteredError';
  }
}
