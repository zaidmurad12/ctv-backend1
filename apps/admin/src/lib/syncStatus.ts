import type { AdminSubtitleDto } from './types';

// Human-readable label for a subtitle's automatic sync analysis (see audioSyncAnalysisService.ts
// on the backend) - shown next to each subtitle row so an admin can see at a glance whether it's
// already been corrected, still analyzing, or needs a manual fix (search/hash-match/upload).
export function syncStatusLabel(s: AdminSubtitleDto): string {
  if (s.syncAnalysisStatus === 'pending') return 'جارٍ تحليل المزامنة...';
  if (s.syncAnalysisStatus === 'failed') return 'تعذّر تحليل المزامنة تلقائياً';
  const offsetSeconds = (s.defaultOffsetMs / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (s.defaultOffsetMs === 0 && s.defaultSpeed === 1) return 'متزامنة (لا حاجة لتصحيح)';
  const speedPart = s.defaultSpeed !== 1 ? ` · السرعة ${(s.defaultSpeed * 100).toFixed(1)}%` : '';
  return `تم تصحيحها تلقائياً (${s.defaultOffsetMs > 0 ? '+' : ''}${offsetSeconds}ث${speedPart})`;
}
