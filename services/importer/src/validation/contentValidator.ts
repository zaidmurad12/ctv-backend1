export interface ContentValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * specification/08-Import-Pipeline.md.txt "Validation Rules: Movie must
 * contain Provider ID, At least one Stream, Valid Status, Valid Type."
 */
export function validateMovieForPublish(input: {
  readonly hasProviderLink: boolean;
  readonly validStreamCount: number;
}): ContentValidationReport {
  const issues: string[] = [];
  if (!input.hasProviderLink) {
    issues.push('Movie must be linked to a provider.');
  }
  if (input.validStreamCount < 1) {
    issues.push('Movie must have at least one valid stream.');
  }
  return { valid: issues.length === 0, issues };
}

/**
 * specification/08-Import-Pipeline.md.txt "Validation Rules: TV Show must
 * contain Provider ID, Season List, Episode List."
 */
export function validateShowForPublish(input: {
  readonly hasProviderLink: boolean;
  readonly seasonCount: number;
  readonly episodeCount: number;
}): ContentValidationReport {
  const issues: string[] = [];
  if (!input.hasProviderLink) {
    issues.push('TV show must be linked to a provider.');
  }
  if (input.seasonCount < 1) {
    issues.push('TV show must have at least one season.');
  }
  if (input.episodeCount < 1) {
    issues.push('TV show must have at least one episode.');
  }
  return { valid: issues.length === 0, issues };
}

/**
 * specification/08-Import-Pipeline.md.txt "Validation Rules: Episode must
 * contain Season, Episode Number, At least one Stream."
 */
export function validateEpisodeForPublish(input: {
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly validStreamCount: number;
}): ContentValidationReport {
  const issues: string[] = [];
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1) {
    issues.push('Episode must belong to a valid season number.');
  }
  if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1) {
    issues.push('Episode must have a valid episode number.');
  }
  if (input.validStreamCount < 1) {
    issues.push('Episode must have at least one valid stream.');
  }
  return { valid: issues.length === 0, issues };
}
