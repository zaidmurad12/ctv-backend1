import { UrlValue, ValidationError } from '@ctv-platform/domain';
import type { ProviderSubtitleDto } from '@ctv-platform/sdk';

export interface SubtitleValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** specification/06-Cinemana-Reverse-Engineering.md.txt "Subtitle Extraction: Formats". */
const ALLOWED_SUBTITLE_FORMATS = new Set(['SRT', 'VTT', 'ASS', 'SSA']);

/** Validates a single subtitle before it is persisted. */
export function validateSubtitle(subtitle: ProviderSubtitleDto): SubtitleValidationReport {
  const issues: string[] = [];

  if (!subtitle.language.trim()) {
    issues.push('Subtitle language must not be empty.');
  }
  if (!ALLOWED_SUBTITLE_FORMATS.has(subtitle.format.toUpperCase())) {
    issues.push(`Subtitle format "${subtitle.format}" is not one of SRT, VTT, ASS, SSA.`);
  }
  try {
    UrlValue.create(subtitle.downloadUrl);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    issues.push(`Subtitle download URL is invalid: ${error.message}`);
  }

  return { valid: issues.length === 0, issues };
}
