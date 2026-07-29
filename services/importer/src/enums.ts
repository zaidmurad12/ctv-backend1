/** Mirrors Prisma's `ImportStatusEnum` value-for-value; see packages/infrastructure for the precedent. */
export enum ImportJobStatusEnum {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  RETRYING = 'RETRYING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** specification/05-Provider-Architecture.md.txt "Provider Discovery" + specification/08-Import-Pipeline.md.txt "Import Modes". */
export enum DiscoveryModeEnum {
  INCREMENTAL = 'INCREMENTAL',
  FULL = 'FULL',
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

/** specification/08-Import-Pipeline.md.txt "Queue Priority". */
export enum ImportPriorityEnum {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Job-level failure categories, distinct from `ProviderErrorCodeEnum` (which
 * classifies a single HTTP call). These classify why an entire import job
 * failed, per the retry table in specification/08-Import-Pipeline.md.txt.
 */
export enum ImportFailureCategoryEnum {
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
