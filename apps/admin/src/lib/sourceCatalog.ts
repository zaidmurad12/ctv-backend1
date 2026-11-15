// Reads the sources' own catalogs from the admin's browser (they only answer requests from inside
// Iraq - see lib/sourceMatch.ts) for the "import from the sources" page: name search, and their
// "newly added" lists, which page back through the whole catalog (page 0 is the newest).

export type SourceName = 'cinemana' | 'cee';
export type SourceKind = 'movie' | 'series';

export interface SourceTitle {
  source: SourceName;
  nb: string;
  kind: SourceKind;
  enTitle?: string;
  arTitle?: string;
  year?: string;
  ref?: string;
  poster?: string;
}

export const SOURCE_LABEL: Record<SourceName, string> = { cinemana: 'سينمانا', cee: 'سي' };

const BASE: Record<SourceName, string> = {
  cinemana: 'https://cinemana.shabakaty.com/api/android',
  cee: 'https://cee.buzz/api/android',
};
const PAGE_SIZE = 24;
const ARABIC_SCRIPT = /[؀-ۿ]/;

interface RawItem {
  nb?: string | number;
  en_title?: string;
  ar_title?: string;
  year?: string | number;
  imdbUrlRef?: string;
  imgThumbObjUrl?: string;
  imgObjUrl?: string;
}

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
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

function toTitles(raw: RawItem[] | { data?: RawItem[] }, source: SourceName, kind: SourceKind) {
  const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
  return list
    .filter((item) => item.nb != null)
    .map((item): SourceTitle => ({
      source,
      nb: String(item.nb),
      kind,
      enTitle: item.en_title?.trim() || undefined,
      arTitle: item.ar_title?.trim() || undefined,
      year: item.year != null && String(item.year).trim() ? String(item.year).trim() : undefined,
      ref: item.imdbUrlRef?.trim() || undefined,
      poster: item.imgThumbObjUrl || item.imgObjUrl || undefined,
    }));
}

// One page of a source's catalog, newest first.
export async function catalogPage(
  source: SourceName,
  kind: SourceKind,
  page: number,
): Promise<SourceTitle[]> {
  const method = kind === 'series' ? 'latestSeries' : 'latestMovies';
  return toTitles(
    await getJson(`${BASE[source]}/${method}/level/0/itemsPerPage/${PAGE_SIZE}/page/${page}`),
    source,
    kind,
  );
}

export async function searchSource(
  source: SourceName,
  query: string,
  kind: SourceKind,
): Promise<SourceTitle[]> {
  const params = new URLSearchParams({ videoTitle: query, type: kind });
  return toTitles(await getJson(`${BASE[source]}/AdvancedSearch?${params}`), source, kind);
}

// An Arabic work: its own title is in Arabic and it has no separate English one.
export function isArabic(title: SourceTitle): boolean {
  return (
    !!title.arTitle &&
    ARABIC_SCRIPT.test(title.arTitle) &&
    (!title.enTitle || ARABIC_SCRIPT.test(title.enTitle))
  );
}

export function displayTitle(title: SourceTitle): string {
  return title.arTitle || title.enTitle || title.nb;
}
