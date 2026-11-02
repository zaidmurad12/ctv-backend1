import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { PreviewModal } from './PreviewModal';
import type { AdminSourceLink, AdminStreamDto, AdminSubtitleDto } from '../lib/types';

// Live preview straight from the playback sources: search CEE/Cinemana by title, pick the match
// (a series also asks which episode), then hand its real video + subtitle files to the same
// PreviewModal used for stored links. Runs from the admin's own browser - the sources send CORS "*"
// on their API, and the backend can't reach them (Cloud Run is blocked). Nothing is saved.
const SOURCES = [
  { key: 'cee', label: 'CEE', base: 'https://cee.buzz/api/android' },
  { key: 'cinemana', label: 'سينمانا', base: 'https://cinemana.shabakaty.com/api/android' },
] as const;

interface Hit {
  sourceKey: 'cee' | 'cinemana';
  source: string;
  base: string;
  nb: string;
  title: string;
  year: string;
  imdb: string | null;
}
interface EpisodeRow {
  nb: string;
  season: number;
  episode: number;
  title: string;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(await response.text());
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function imdbOf(url: unknown): string | null {
  return typeof url === 'string' ? (url.match(/tt\d{6,10}/)?.[0] ?? null) : null;
}

export function SourcePreview({
  title,
  altTitle,
  imdbId,
  kind,
  poster,
  backdrop,
  logo,
  linkedSources,
  onSaveLinks,
  onClose,
}: {
  title: string;
  altTitle?: string | null;
  imdbId?: string | null;
  kind: 'movie' | 'series';
  poster?: string | null;
  backdrop?: string | null;
  logo?: string | null;
  // The entries this title is currently pinned to (see Movie.sourceLinks) and how to change them.
  linkedSources?: AdminSourceLink[];
  onSaveLinks?: (links: AdminSourceLink[]) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(title);
  // Which SECTION of the sources to search - independent of what this title is called here: a stage play is a
  // movie in our catalog but many sources list it under series, so it is only found by searching "series".
  const [searchKind, setSearchKind] = useState<'movie' | 'series'>(kind);
  const [savingLink, setSavingLink] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [episodes, setEpisodes] = useState<{ hit: Hit; rows: EpisodeRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ label: string; streams: AdminStreamDto[]; subtitles: AdminSubtitleDto[] } | null>(null);

  async function search(text: string, sectionKind: 'movie' | 'series' = searchKind) {
    setSearching(true);
    setError(null);
    setEpisodes(null);
    const found: Hit[] = [];
    const failures: string[] = [];
    for (const source of SOURCES) {
      try {
        const rows = asArray(await getJson(`${source.base}/AdvancedSearch?videoTitle=${encodeURIComponent(text)}&type=${sectionKind}`));
        for (const row of rows.slice(0, 8)) {
          if (row.nb == null) continue;
          found.push({
            sourceKey: source.key,
            source: source.label,
            base: source.base,
            nb: String(row.nb),
            title: String(row.en_title || row.ar_title || ''),
            year: row.year != null ? String(row.year) : '',
            imdb: imdbOf(row.imdbUrlRef),
          });
        }
      } catch (err) {
        failures.push(`${source.label}: ${err instanceof Error ? err.message : 'تعذّر الاتصال'}`);
      }
    }
    // An exact IMDb match is the surest sign it's the same title - those float to the top.
    found.sort((a, b) => Number(!!imdbId && b.imdb === imdbId) - Number(!!imdbId && a.imdb === imdbId));
    setHits(found);
    if (failures.length) setError(failures.join(' | '));
    setSearching(false);
  }

  useEffect(() => {
    void search(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openVideo(base: string, source: string, nb: string, label: string) {
    setLoading(true);
    setError(null);
    try {
      const [files, info] = await Promise.all([
        getJson(`${base}/transcoddedFiles/id/${encodeURIComponent(nb)}`),
        getJson(`${base}/allVideoInfo/id/${encodeURIComponent(nb)}`),
      ]);
      const streams: AdminStreamDto[] = asArray(files)
        .map((row, index) => ({
          id: `src:${source}:${nb}:${index}`,
          quality: String(row.resolution || row.name || 'unknown'),
          serverName: source,
          streamUrl: String(row.videoUrl || row.url || ''),
          language: null,
          isDefault: index === 0,
          isActive: true,
        }))
        .filter((s) => !!s.streamUrl);
      const infoObj = (Array.isArray(info) ? info[0] : ((info as { data?: unknown })?.data ?? info)) as Record<string, unknown> | undefined;
      const translations = (Array.isArray(infoObj?.translations) ? infoObj.translations : []) as Array<Record<string, unknown>>;
      const subtitles: AdminSubtitleDto[] = translations
        .map((track, index) => {
          const url = String(track.file || track.url || '');
          return {
            id: `src:${source}:${nb}:sub${index}`,
            language: String(track.name || 'unknown'),
            format: (url.split('?')[0]?.split('.').pop() || 'srt').toLowerCase().slice(0, 10),
            url,
            isDefault: false,
            syncAnalysisStatus: 'NONE',
            defaultOffsetMs: 0,
            defaultSpeed: 1,
          };
        })
        .filter((t) => !!t.url);
      if (streams.length === 0) {
        setError('لا توجد روابط تشغيل لهذا العمل في هذا المصدر.');
        return;
      }
      setPlaying({ label, streams, subtitles });
    } catch (err) {
      setError(err instanceof Error ? `تعذّر جلب الفيديو: ${err.message}` : 'تعذّر جلب الفيديو.');
    } finally {
      setLoading(false);
    }
  }

  async function saveLink(hit: Hit) {
    if (!onSaveLinks) return;
    setSavingLink(true);
    setError(null);
    try {
      const others = (linkedSources ?? []).filter((link) => link.source !== hit.sourceKey);
      await onSaveLinks([...others, { source: hit.sourceKey, nb: hit.nb, kind: searchKind }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الربط.');
    } finally {
      setSavingLink(false);
    }
  }

  async function removeLink(link: AdminSourceLink) {
    if (!onSaveLinks) return;
    setSavingLink(true);
    try {
      await onSaveLinks((linkedSources ?? []).filter((l) => !(l.source === link.source && l.nb === link.nb)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الربط.');
    } finally {
      setSavingLink(false);
    }
  }

  async function pick(hit: Hit) {
    if (searchKind === 'movie') {
      await openVideo(hit.base, hit.source, hit.nb, `${title} (${hit.source})`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = asArray(await getJson(`${hit.base}/videoSeason/id/${encodeURIComponent(hit.nb)}`))
        .filter((row) => row.nb != null)
        .map((row) => ({
          nb: String(row.nb),
          season: Number(row.season ?? 1) || 1,
          episode: Number(row.episodeNummer ?? 0) || 0,
          title: String(row.en_title || row.ar_title || ''),
        }))
        .sort((a, b) => a.season - b.season || a.episode - b.episode);
      if (rows.length === 0) setError('لا توجد حلقات لهذا المسلسل في هذا المصدر.');
      else setEpisodes({ hit, rows });
    } catch (err) {
      setError(err instanceof Error ? `تعذّر جلب الحلقات: ${err.message}` : 'تعذّر جلب الحلقات.');
    } finally {
      setLoading(false);
    }
  }

  if (playing) {
    return (
      <PreviewModal
        title={playing.label}
        streams={playing.streams}
        subtitles={playing.subtitles}
        poster={poster}
        backdrop={backdrop}
        logo={logo}
        onClose={() => setPlaying(null)}
      />
    );
  }

  const seasons = episodes ? [...new Set(episodes.rows.map((r) => r.season))] : [];
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold border border-zinc-700 hover:bg-zinc-800';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black">معاينة من المصادر — {title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-900">
            <X size={16} />
          </button>
        </div>

        {!episodes && (
          <>
            {onSaveLinks && (
              <div className="mb-3 text-xs">
                <p className="text-zinc-400 mb-1">مرتبط حالياً (يُستخدم في التطبيق بدل المطابقة التلقائية):</p>
                {(linkedSources ?? []).length === 0 && <p className="text-zinc-600">لا يوجد ربط يدوي.</p>}
                <div className="flex flex-wrap gap-2">
                  {(linkedSources ?? []).map((link) => (
                    <span key={`${link.source}:${link.nb}`} className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400">
                      {link.source === 'cee' ? 'CEE' : 'سينمانا'} · #{link.nb} · {link.kind === 'series' ? 'قسم المسلسلات' : 'قسم الأفلام'}
                      <button type="button" disabled={savingLink} onClick={() => void removeLink(link)} title="إزالة الربط">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-zinc-400">ابحث في قسم:</span>
              {(['movie', 'series'] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => {
                    setSearchKind(section);
                    void search(query, section);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold border ${searchKind === section ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-300'}`}
                >
                  {section === 'movie' ? 'الأفلام' : 'المسلسلات'}
                </button>
              ))}
              {kind === 'movie' && searchKind === 'series' && (
                <span className="text-amber-400">(للمسرحيات وما شابهها المُدرجة كمسلسل في المصدر)</span>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search(query);
              }}
              className="flex gap-2 mb-3"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-black border border-zinc-800 text-white"
              />
              <button type="submit" className={btn} disabled={searching}>
                {searching ? <Loader2 size={12} className="animate-spin" /> : 'بحث'}
              </button>
              {altTitle && altTitle !== query && (
                <button type="button" className={btn} onClick={() => { setQuery(altTitle); void search(altTitle); }}>
                  {altTitle}
                </button>
              )}
            </form>
            <div className="space-y-1">
              {hits.map((hit) => (
                <div key={`${hit.source}:${hit.nb}`} className="flex items-stretch gap-1">
                <button
                  onClick={() => void pick(hit)}
                  disabled={loading}
                  className="flex-1 text-start px-3 py-2 rounded-lg text-xs bg-zinc-900 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <b>{hit.source}</b>
                  <span className="flex-1">
                    {hit.title} {hit.year && `(${hit.year})`}
                  </span>
                  {imdbId && hit.imdb === imdbId && <span className="text-emerald-400 text-[11px]">مطابقة مؤكدة (IMDb)</span>}
                </button>
                {onSaveLinks && (
                  <button
                    type="button"
                    disabled={savingLink}
                    onClick={() => void saveLink(hit)}
                    className="px-3 rounded-lg text-[11px] font-bold border border-emerald-700 text-emerald-400 hover:bg-emerald-500/10"
                    title="اعتماد هذا العنوان كمصدر تشغيل لهذا العمل"
                  >
                    ربط بالعمل
                  </button>
                )}
                </div>
              ))}
              {!searching && hits.length === 0 && <p className="text-xs text-zinc-500">لا توجد نتائج - جرّب اسماً آخر.</p>}
            </div>
          </>
        )}

        {episodes && (
          <>
            <button className={`${btn} mb-3`} onClick={() => setEpisodes(null)}>
              رجوع للنتائج
            </button>
            <p className="text-xs text-zinc-400 mb-2">
              {episodes.hit.source} · {episodes.hit.title} - اختر الحلقة:
            </p>
            {seasons.map((season) => (
              <div key={season} className="mb-3">
                <p className="text-[11px] text-zinc-500 mb-1">الموسم {season}</p>
                <div className="flex flex-wrap gap-1.5">
                  {episodes.rows
                    .filter((r) => r.season === season)
                    .map((r) => (
                      <button
                        key={r.nb}
                        title={r.title}
                        disabled={loading}
                        onClick={() => void openVideo(episodes.hit.base, episodes.hit.source, r.nb, `${title} - الموسم ${r.season} الحلقة ${r.episode}`)}
                        className="w-10 h-8 rounded-md bg-zinc-900 hover:bg-zinc-800 text-xs font-bold"
                      >
                        {r.episode}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </>
        )}

        {loading && (
          <p className="text-[11px] text-zinc-500 mt-3 flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" /> جارٍ التحميل...
          </p>
        )}
        {error && <p className="text-[11px] text-amber-400 mt-3">{error}</p>}
      </div>
    </div>
  );
}
