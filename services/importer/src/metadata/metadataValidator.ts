import { Title, UrlValue, ValidationError } from '@ctv-platform/domain';
import type { ProviderMovieDto, ProviderShowDto } from '@ctv-platform/sdk';

export interface MetadataValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface MetadataValidationReport {
  readonly valid: boolean;
  readonly issues: readonly MetadataValidationIssue[];
}

function check(field: string, run: () => void, issues: MetadataValidationIssue[]): void {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationError) {
      issues.push({ field, message: error.message });
      return;
    }
    throw error;
  }
}

/**
 * Validates enrichment output before it is merged, reusing the domain's own
 * value-object invariants (`Title`, `UrlValue`) instead of re-implementing
 * them.
 */
export function validateMovieMetadata(dto: ProviderMovieDto): MetadataValidationReport {
  const issues: MetadataValidationIssue[] = [];
  check('title', () => Title.create(dto.title), issues);
  for (const [field, url] of Object.entries(dto.artwork)) {
    if (url) {
      check(`artwork.${field}`, () => UrlValue.create(url), issues);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateShowMetadata(dto: ProviderShowDto): MetadataValidationReport {
  const issues: MetadataValidationIssue[] = [];
  check('title', () => Title.create(dto.title), issues);
  for (const [field, url] of Object.entries(dto.artwork)) {
    if (url) {
      check(`artwork.${field}`, () => UrlValue.create(url), issues);
    }
  }
  return { valid: issues.length === 0, issues };
}
