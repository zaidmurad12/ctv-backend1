/**
 * Mirrors the Prisma `ProviderStatusEnum` values 1:1 so a future persistence
 * mapper needs no translation table between the SDK and the database.
 */
export enum ProviderStatusEnum {
  HEALTHY = 'HEALTHY',
  UNAVAILABLE = 'UNAVAILABLE',
  MAINTENANCE = 'MAINTENANCE',
  DISABLED = 'DISABLED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * `health()` is mandatory for every provider and is therefore not modeled as
 * a capability. Every other interface method is optional per provider (a
 * metadata-only provider such as TMDB never supports streams/subtitles).
 */
export enum ProviderCapabilityEnum {
  DISCOVERY = 'DISCOVERY',
  SEARCH = 'SEARCH',
  MOVIE_DETAILS = 'MOVIE_DETAILS',
  SHOW_DETAILS = 'SHOW_DETAILS',
  SEASON_DETAILS = 'SEASON_DETAILS',
  EPISODE_DETAILS = 'EPISODE_DETAILS',
  STREAMS = 'STREAMS',
  SUBTITLES = 'SUBTITLES',
  METADATA_ENRICHMENT = 'METADATA_ENRICHMENT',
}

/**
 * The standardized error categories a provider is allowed to surface.
 * `NOT_SUPPORTED` is an SDK-level addition to the specification's list,
 * raised by the capability gate before a provider method ever runs.
 */
export enum ProviderErrorCodeEnum {
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
