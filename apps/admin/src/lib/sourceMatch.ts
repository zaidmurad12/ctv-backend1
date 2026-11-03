// Source-compatibility check, run in the admin's own browser (see pages/source-check.tsx): the
// sources only answer requests from inside Iraq, so neither the backend (outside it) can do this.
// The matching below is a copy of the TV app's own (CinemanaTVRN src/api.ts: normalizeTitle,
// calculateMatchScore, titleVariants, searchAndMatch) - keep the two in step, or the panel and the
// app will disagree about which titles play.

export interface CheckTitle {
  type: 'movie' | 'show';
  id: string;
  title: string;
  titleAr: string | null;
  originalTitle: string | null;
  year: number | null;
  imdbId: string | null;
  originalLanguage: string | null;
  // Draft titles are checked too, and published when found (server side).
  status?: string;
  // An admin-entered stream link or hand-pinned source entries: playable without any search.
  hasPlaybackLink?: boolean;
}

interface SourceItem {
  nb?: string | number;
  en_title?: string;
  ar_title?: string;
  year?: string | number;
  imdbUrlRef?: string;
  type?: string;
  kind?: string | number;
}

export interface CheckResult {
  match: boolean;
  source?: 'cinemana' | 'cee' | 'link';
  nb?: string;
  sourceTitle?: string;
  // Matched, but the entry had no video (no files / no episodes) - counted as not playable.
  emptyEntry?: boolean;
}

const SOURCES = {
  cinemana: 'https://cinemana.shabakaty.com/api/android',
  cee: 'https://cee.buzz/api/android',
} as const;
type SourceKey = keyof typeof SOURCES;

const MATCH_THRESHOLD = 85;
const ARABIC_SCRIPT = /[؀-ۿ]/;

async function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function asArray<T>(value: T[] | { data?: T[] } | null | undefined): T[] {
  return Array.isArray(value) ? value : (value?.data ?? []);
}

async function search(
  source: SourceKey,
  query: string,
  type: 'movie' | 'series',
): Promise<SourceItem[]> {
  const params = new URLSearchParams({ videoTitle: query, type });
  const items = asArray(
    await getJson<SourceItem[] | { data?: SourceItem[] }>(
      `${SOURCES[source]}/AdvancedSearch?${params}`,
    ),
  );
  return items.map((item) => ({ ...item, type }));
}

function num(value?: string | number | null): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTitle(value?: string | null): string {
  return (value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function extractImdbId(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:imdb\.com\/title\/)?(tt\d{7,10})/i);
  return match?.[1]?.toLowerCase();
}

function titleSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = previous[j];
      previous[j] =
        left[i - 1] === right[j - 1]
          ? diagonal
          : Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + 1);
      diagonal = saved;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function matchScore(t: CheckTitle, item: SourceItem): number {
  const ourType = t.type === 'show' ? 'series' : 'movie';
  const itemType = String(item.type ?? (String(item.kind) === '2' ? 'series' : 'movie'))
    .toLowerCase()
    .includes('series')
    ? 'series'
    : 'movie';
  if (ourType !== itemType) return 0;
  const ourImdb = extractImdbId(t.imdbId);
  const itemImdb = extractImdbId(item.imdbUrlRef);
  if (ourImdb && itemImdb && ourImdb === itemImdb) return 100;
  const en = normalizeTitle(t.title);
  const orig = normalizeTitle(t.originalTitle);
  const ar = normalizeTitle(t.titleAr);
  const itemEn = normalizeTitle(item.en_title);
  const itemAr = normalizeTitle(item.ar_title);
  const englishExact = (!!en && en === itemEn) || (!!orig && orig === itemEn);
  const arabicOriginal = ARABIC_SCRIPT.test(t.originalTitle ?? '') ? orig : '';
  const arabicExact = [ar, arabicOriginal].some((x) => !!x && (x === itemAr || x === itemEn));
  const fuzzy = Math.max(
    titleSimilarity(en, itemEn),
    titleSimilarity(orig, itemEn),
    titleSimilarity(en, itemAr),
    titleSimilarity(orig, itemAr),
    titleSimilarity(ar, itemEn),
    titleSimilarity(ar, itemAr),
  );
  const itemYear = num(item.year);
  if (t.year && itemYear && Math.abs(t.year - itemYear) > 1) return 0;
  const yearScore =
    t.year && itemYear ? (t.year === itemYear ? 20 : Math.abs(t.year - itemYear) === 1 ? 8 : 0) : 0;
  return Math.min(
    100,
    15 + (englishExact ? 45 : 0) + (arabicExact ? 35 : 0) + Math.round(fuzzy * 25) + yearScore,
  );
}

function bestMatch(t: CheckTitle, candidates: SourceItem[]): SourceItem | null {
  let best: SourceItem | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = matchScore(t, c);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

function arabicSearchForm(title: string): string {
  if (!ARABIC_SCRIPT.test(title)) return title;
  return title
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى(?=\s|$)/g, 'ي')
    .replace(/ة(?=\s|$)/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleVariants(titles: string[]): string[] {
  const variants = new Set<string>();
  for (const title of titles) {
    const base = title.trim();
    const lower = base.toLowerCase();
    const titleCase = lower.replace(
      /(^|[\s\-:(])(\p{L})/gu,
      (_m, before: string, letter: string) => before + letter.toUpperCase(),
    );
    const noPunctuation = base
      .replace(/[:\-–—'’.,!?&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const beforeSubtitle = base.split(/\s*[:\-–—]\s+/)[0].trim();
    for (const v of [
      lower,
      titleCase,
      base.toUpperCase(),
      noPunctuation,
      beforeSubtitle,
      `${base} `,
      ` ${base}`,
    ]) {
      if (v.trim().length >= 2 && !titles.includes(v)) variants.add(v);
    }
  }
  return [...variants].slice(0, 10);
}

async function searchAndMatch(t: CheckTitle, source: SourceKey): Promise<SourceItem | null> {
  const type = t.type === 'show' ? 'series' : 'movie';
  const arabicWork = t.originalLanguage === 'ar' || ARABIC_SCRIPT.test(t.originalTitle ?? '');
  const ordered = arabicWork
    ? [t.titleAr, t.originalTitle, t.title]
    : [t.title, t.originalTitle, t.titleAr];
  const titles = [...new Set(ordered.filter((x): x is string => !!x?.trim()).map((x) => x.trim()))];
  const run = async (queries: string[]) => {
    const groups = await Promise.all(
      queries.map((q) => search(source, q, type).catch(() => [] as SourceItem[])),
    );
    return bestMatch(t, groups.flat());
  };
  const first = await run(titles);
  if (first) return first;
  const variants = titleVariants(titles.map(arabicSearchForm).concat(titles));
  return variants.length ? run(variants) : null;
}

// Does the matched entry actually have something to play? A film: at least one video file. A
// series: at least one episode.
async function hasVideo(source: SourceKey, nb: string, kind: 'movie' | 'show'): Promise<boolean> {
  try {
    if (kind === 'show') {
      const episodes = asArray(
        await getJson<unknown[] | { data?: unknown[] }>(
          `${SOURCES[source]}/videoSeason/id/${encodeURIComponent(nb)}`,
        ),
      );
      return episodes.length > 0;
    }
    const files = asArray(
      await getJson<
        | Array<{ videoUrl?: string; url?: string }>
        | { data?: Array<{ videoUrl?: string; url?: string }> }
      >(`${SOURCES[source]}/transcoddedFiles/id/${encodeURIComponent(nb)}`),
    );
    return files.some((f) => !!(f.videoUrl || f.url));
  } catch {
    return false;
  }
}

// Cinemana first, then CEE (it mirrors Cinemana under the same entry numbers, so Cinemana's match
// is also tried on CEE when Cinemana itself has no video for it) - the same order the app plays from.
export async function checkTitle(t: CheckTitle): Promise<CheckResult> {
  // Has a playback link of its own - it plays whatever the sources say.
  if (t.hasPlaybackLink) return { match: true, source: 'link' };
  let emptyEntry = false;
  const cin = await searchAndMatch(t, 'cinemana');
  if (cin?.nb != null) {
    const nb = String(cin.nb);
    if (await hasVideo('cinemana', nb, t.type))
      return { match: true, source: 'cinemana', nb, sourceTitle: cin.ar_title || cin.en_title };
    if (await hasVideo('cee', nb, t.type))
      return { match: true, source: 'cee', nb, sourceTitle: cin.ar_title || cin.en_title };
    emptyEntry = true;
  }
  const cee = await searchAndMatch(t, 'cee');
  if (cee?.nb != null) {
    const nb = String(cee.nb);
    if (await hasVideo('cee', nb, t.type))
      return { match: true, source: 'cee', nb, sourceTitle: cee.ar_title || cee.en_title };
    emptyEntry = true;
  }
  return { match: false, emptyEntry };
}
