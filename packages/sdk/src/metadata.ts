import type { ProviderCapabilityEnum } from './enums.js';

/**
 * Static identity of a provider. Registered once alongside the provider
 * instance; never mutated at runtime.
 */
export interface ProviderMetadata {
  /** Stable slug used everywhere as the registry key, e.g. "cinemana". */
  readonly id: string;
  readonly name: string;
  /** Version of this provider adapter itself. */
  readonly version: string;
  /** Version of the external API the adapter was written against. */
  readonly apiVersion: string;
  /** Oldest external API version this adapter is still known to work with. */
  readonly minimumSupportedVersion: string;
  /** Lower number = higher priority when multiple providers can serve a request. */
  readonly priority: number;
  readonly capabilities: readonly ProviderCapabilityEnum[];
}
