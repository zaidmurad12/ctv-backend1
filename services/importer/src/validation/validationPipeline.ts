import type { ProviderStreamDto, ProviderSubtitleDto } from '@ctv-platform/sdk';
import { validateStream } from './streamValidator.js';
import { validateSubtitle } from './subtitleValidator.js';

export interface MediaValidationResult {
  readonly validStreams: readonly ProviderStreamDto[];
  readonly validSubtitles: readonly ProviderSubtitleDto[];
  readonly issues: readonly string[];
}

/**
 * Filters out invalid streams/subtitles rather than failing the whole
 * import — an item with some bad streams should still publish with the
 * good ones, per specification/08-Import-Pipeline.md.txt's philosophy that
 * every stage should be resilient and restartable.
 */
export function validateMedia(
  streams: readonly ProviderStreamDto[],
  subtitles: readonly ProviderSubtitleDto[],
): MediaValidationResult {
  const issues: string[] = [];

  const validStreams = streams.filter((stream) => {
    const report = validateStream(stream);
    if (!report.valid) {
      issues.push(...report.issues.map((issue) => `stream[${stream.playbackUrl}]: ${issue}`));
    }
    return report.valid;
  });

  const validSubtitles = subtitles.filter((subtitle) => {
    const report = validateSubtitle(subtitle);
    if (!report.valid) {
      issues.push(...report.issues.map((issue) => `subtitle[${subtitle.downloadUrl}]: ${issue}`));
    }
    return report.valid;
  });

  return { validStreams, validSubtitles, issues };
}
