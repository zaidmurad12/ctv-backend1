import { UrlValue, ValidationError } from '@ctv-platform/domain';
import type { ProviderStreamDto } from '@ctv-platform/sdk';

export interface StreamValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Validates a single stream before it is persisted. */
export function validateStream(stream: ProviderStreamDto): StreamValidationReport {
  const issues: string[] = [];

  if (!stream.quality.trim()) {
    issues.push('Stream quality must not be empty.');
  }
  if (!stream.serverName.trim()) {
    issues.push('Stream server name must not be empty.');
  }
  try {
    UrlValue.create(stream.playbackUrl);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    issues.push(`Stream playback URL is invalid: ${error.message}`);
  }

  return { valid: issues.length === 0, issues };
}
