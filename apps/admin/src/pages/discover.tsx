import { useState } from 'react';
import { Loader2, Search, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type {
  ArchiveDiscoverCandidateDto,
  DiscoverCandidateDto,
  DiscoverParams,
} from '../lib/types';

// Which library "استيراد ذكي" searches - TMDB's own /discover filters (rating/year/genre/
// language, the original behavior) or a source provider's own library (Internet Archive's
// public-domain feature_films collection today; the same "source" concept a future provider
// would slot into rather than getting its own separate page). Both funnel into the same
// search-then-pick-then-import-a-batch shape, just backed by different endpoints below.
type DiscoverSource = 'tmdb' | 'archive';

const SORTS: { value: NonNullable<DiscoverParams['sortBy']>; label: string }[] = [
  { value: 'vote_average.desc', label: 'الأعلى تقييمًا' },
  { value: 'popularity.desc', label: 'الأكثر شهرة' },
  { value: 'primary_release_date.desc', label: 'الأحدث' },
];

// Real-world genre names TMDB actually recognizes for both movies and TV - a free-text field
// backed by TmdbDiscoverService's own name->id lookup rather than a hardcoded id list, so this
// stays correct regardless of which TMDB genre set (movie vs tv, which don't fully overlap)
// applies to the current search.
const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
];

// A dropdown of (Arabic label -> real ISO code), not a free-text field - TMDB's
// with_original_language filter only ever matches the literal ISO code ("ar"), so typing the
// Arabic word "عربي" into a plain text input silently matched nothing at all. Same wider list as
// the TV app's own languageName() table (src/i18n.ts), not just a handful of common ones.
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'الإنجليزية' },
  { code: 'es', label: 'الإسبانية' },
  { code: 'hi', label: 'الهندية' },
  { code: 'fr', label: 'الفرنسية' },
  { code: 'de', label: 'الألمانية' },
  { code: 'it', label: 'الإيطالية' },
  { code: 'tr', label: 'التركية' },
  { code: 'ko', label: 'الكورية' },
  { code: 'ja', label: 'اليابانية' },
  { code: 'zh', label: 'الصينية' },
  { code: 'ru', label: 'الروسية' },
  { code: 'pt', label: 'البرتغالية' },
  { code: 'fa', label: 'الفارسية' },
  { code: 'ur', label: 'الأردية' },
  { code: 'nl', label: 'الهولندية' },
  { code: 'sv', label: 'السويدية' },
  { code: 'no', label: 'النرويجية' },
  { code: 'da', label: 'الدنماركية' },
  { code: 'fi', label: 'الفنلندية' },
  { code: 'pl', label: 'البولندية' },
  { code: 'cs', label: 'التشيكية' },
  { code: 'hu', label: 'المجرية' },
  { code: 'ro', label: 'الرومانية' },
  { code: 'bg', label: 'البلغارية' },
  { code: 'el', label: 'اليونانية' },
  { code: 'uk', label: 'الأوكرانية' },
  { code: 'sr', label: 'الصربية' },
  { code: 'he', label: 'العبرية' },
  { code: 'th', label: 'التايلاندية' },
  { code: 'vi', label: 'الفيتنامية' },
  { code: 'id', label: 'الإندونيسية' },
  { code: 'ms', label: 'الماليزية' },
  { code: 'tl', label: 'الفلبينية' },
  { code: 'bn', label: 'البنغالية' },
  { code: 'ta', label: 'التاميلية' },
  { code: 'te', label: 'التيلوغوية' },
  { code: 'ml', label: 'المالايالامية' },
  { code: 'pa', label: 'البنجابية' },
  { code: 'ku', label: 'الكردية' },
];

// Internet Archive's own `subject` field is free-text tags (e.g. "romance;comedy"), not a real
// taxonomy - this is a best-effort shortlist of tags that actually show up often on real
// public-domain feature films, not the full TMDB genre list above (many of those, e.g. "Fantasy"
// as a distinct tag, essentially never appear as-is on this collection's own tagging).
const ARCHIVE_GENRES = [
  'Comedy',
  'Drama',
  'Horror',
  'Western',
  'Action',
  'Science Fiction',
  'Documentary',
  'Animation',
  'Musical',
  'Mystery',
  'Thriller',
  'Romance',
  'War',
  'Crime',
  'Adventure',
];

// Internet Archive's own `language` field uses MARC three-letter codes, not TMDB's two-letter ISO
// ones - a completely different code space, hence a separate list rather than reusing LANGUAGES
// above. Limited to languages that actually show up in real volume on this collection (almost
// entirely English- and a handful of European-language silent/early-sound era films).
const ARCHIVE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'الإنجليزية' },
  { code: 'fre', label: 'الفرنسية' },
  { code: 'ger', label: 'الألمانية' },
  { code: 'ita', label: 'الإيطالية' },
  { code: 'spa', label: 'الإسبانية' },
  { code: 'rus', label: 'الروسية' },
];

export default function DiscoverPage() {
  const { isLoading, user } = useAuth();
  const [source, setSource] = useState<DiscoverSource>('tmdb');
  const [type, setType] = useState<'movie' | 'show'>('movie');
  const [sortBy, setSortBy] = useState<DiscoverParams['sortBy']>('vote_average.desc');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState('');
  const [limit, setLimit] = useState(10);
  // Default (10) is deliberately low - TMDB's own vote counts for non-English/regional cinema
  // run far lower than Hollywood-scale content regardless of how popular a title actually is
  // locally (see TmdbDiscoverService's own comment: "highest rated Arabic movies" at the old
  // default of 100 returned almost nothing but festival films). Exposed here so an admin
  // searching something even more niche can drop it further, or raise it back up for a big,
  // well-covered market like English.
  const [minVoteCount, setMinVoteCount] = useState(10);

  const [results, setResults] = useState<DiscoverCandidateDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Internet Archive: a completely different search (free-text title, not TMDB's filter set) and
  // a completely different import step (needs a TMDB title+year match for real metadata, and
  // refuses anything without a recognized public-domain/CC license - see
  // AdminDiscoverUseCases.discoverArchive/importArchive on the backend) - kept as separate state
  // rather than reusing the TMDB results/selected state above, which assumes tmdbId-keyed items.
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveSortBy, setArchiveSortBy] = useState<'downloads' | 'addeddate'>('downloads');
  const [archiveGenre, setArchiveGenre] = useState('');
  const [archiveLanguage, setArchiveLanguage] = useState('');
  const [archiveResults, setArchiveResults] = useState<ArchiveDiscoverCandidateDto[]>([]);
  const [archiveSelected, setArchiveSelected] = useState<Set<string>>(new Set());
  const [archiveStart, setArchiveStart] = useState(0);
  const [searchingArchive, setSearchingArchive] = useState(false);
  const [importingArchive, setImportingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveSearched, setArchiveSearched] = useState(false);

  // A fresh search (filters just changed, or the button pressed after none were run yet) always
  // starts over at TMDB's own page 1 and replaces the list; "load more" keeps the same filters
  // and existing results, just advances the page and appends - the two used to be the same call,
  // which meant searching again with unchanged filters only ever re-fetched the exact same
  // page-1 results (a title's rank doesn't shift moment to moment), reading as "nothing new."
  async function runSearch(nextPage: number, append: boolean) {
    setSearching(true);
    setError(null);
    setMessage(null);
    try {
      const items = await adminService.discover({
        type,
        sortBy,
        year: year ? Number(year) : undefined,
        genre: genre || undefined,
        originalLanguage: originalLanguage || undefined,
        minVoteCount,
        limit,
        page: nextPage,
      });
      // Titles already in the library used to still render here (grayed out, a "موجود في
      // القاعدة" badge) - filtered out entirely now instead, per explicit request, so a search
      // only ever shows what's actually importable.
      const fresh = items.filter((item) => !item.alreadyImported);
      setResults((prev) => (append ? [...prev, ...fresh] : fresh));
      setSelected((prev) => {
        const next = append ? new Set(prev) : new Set<string>();
        for (const item of fresh) next.add(item.tmdbId);
        return next;
      });
      setPage(nextPage);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر البحث في TMDB.');
    } finally {
      setSearching(false);
    }
  }

  function search() {
    return runSearch(1, false);
  }

  function loadMore() {
    return runSearch(page + 1, true);
  }

  function toggle(tmdbId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  }

  async function importSelected() {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      const outcomes = await adminService.discoverImport(type, Array.from(selected));
      const okCount = outcomes.filter((o) => o.success).length;
      const failed = outcomes.filter((o) => !o.success);
      setMessage(
        `تم استيراد ${okCount} من ${outcomes.length}.` +
          (failed.length ? ` فشل: ${failed.map((f) => f.tmdbId).join(', ')}` : ''),
      );
      // Removed from the visible results outright (was left in, grayed out, marked
      // alreadyImported) - same "don't show what's already in the library" rule search results
      // now follow, applied the instant an item stops being importable rather than only on the
      // next fresh search.
      const importedIds = new Set(outcomes.filter((o) => o.success).map((o) => o.tmdbId));
      setResults((prev) => prev.filter((r) => !importedIds.has(r.tmdbId)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of importedIds) next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاستيراد.');
    } finally {
      setImporting(false);
    }
  }

  // Same fresh-search-vs-load-more split as runSearch above, just against Internet Archive's own
  // `start` offset instead of TMDB's page number.
  async function runArchiveSearch(nextStart: number, append: boolean) {
    setSearchingArchive(true);
    setArchiveError(null);
    setArchiveMessage(null);
    try {
      const items = await adminService.discoverArchive(
        archiveQuery.trim(),
        nextStart,
        archiveSortBy,
        archiveGenre || undefined,
        archiveLanguage || undefined,
      );
      // Same "don't show what's already in the library" rule as the TMDB search above - only
      // isRecognizedOpenLicense/hasPlayableFile/matchedTmdbId (genuinely different reasons an
      // item can't be imported yet) still render their own badge and stay in the list.
      const fresh = items.filter((item) => !item.alreadyImported);
      setArchiveResults((prev) => (append ? [...prev, ...fresh] : fresh));
      setArchiveSelected((prev) => {
        const next = append ? new Set(prev) : new Set<string>();
        for (const item of fresh) {
          if (item.isRecognizedOpenLicense && item.hasPlayableFile && item.matchedTmdbId) {
            next.add(item.identifier);
          }
        }
        return next;
      });
      setArchiveStart(nextStart);
      setArchiveSearched(true);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'تعذّر البحث في Internet Archive.');
    } finally {
      setSearchingArchive(false);
    }
  }

  function searchArchive() {
    return runArchiveSearch(0, false);
  }

  function loadMoreArchive() {
    return runArchiveSearch(archiveStart + 12, true);
  }

  function toggleArchive(identifier: string) {
    setArchiveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return next;
    });
  }

  async function importSelectedArchive() {
    if (archiveSelected.size === 0) return;
    setImportingArchive(true);
    setArchiveError(null);
    setArchiveMessage(null);
    try {
      const outcomes = await adminService.discoverImportArchive(Array.from(archiveSelected));
      const okCount = outcomes.filter((o) => o.success).length;
      const failed = outcomes.filter((o) => !o.success);
      setArchiveMessage(
        `تم استيراد ${okCount} من ${outcomes.length}.` +
          (failed.length
            ? ` فشل: ${failed.map((f) => `${f.identifier} (${f.error ?? ''})`).join('، ')}`
            : ''),
      );
      const importedIds = new Set(outcomes.filter((o) => o.success).map((o) => o.identifier));
      setArchiveResults((prev) => prev.filter((r) => !importedIds.has(r.identifier)));
      setArchiveSelected((prev) => {
        const next = new Set(prev);
        for (const id of importedIds) next.delete(id);
        return next;
      });
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'فشل الاستيراد.');
    } finally {
      setImportingArchive(false);
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} />
          <h1 className="text-2xl font-black">استيراد ذكي</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6">
          ابحث في مكتبة مزوّد واستورد ما تختاره فقط دفعة واحدة - الأعمال الموجودة أصلاً في القاعدة
          تُعلَّم تلقائيًا لتجنّب التكرار.
        </p>

        <div className="flex items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSource('tmdb')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              source === 'tmdb'
                ? 'bg-white text-black'
                : 'bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            TMDB
          </button>
          <button
            type="button"
            onClick={() => setSource('archive')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              source === 'archive'
                ? 'bg-white text-black'
                : 'bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            Internet Archive (أفلام ملكية عامة)
          </button>
        </div>

        {source === 'tmdb' && (
          <>
            <div className="bg-white/5 border border-zinc-800 rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'movie' | 'show')}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white col-span-2 md:col-span-1"
              >
                <option value="movie">أفلام</option>
                <option value="show">مسلسلات</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as DiscoverParams['sortBy'])}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white col-span-2 md:col-span-1"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                placeholder="السنة (اختياري)"
                className="px-3 py-2 rounded-lg text-sm bg-black border border-zinc-800 text-white placeholder:text-zinc-600"
              />

              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white"
              >
                <option value="">كل التصنيفات</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={originalLanguage}
                onChange={(e) => setOriginalLanguage(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white"
              >
                <option value="">كل اللغات</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
                placeholder="العدد"
                className="px-3 py-2 rounded-lg text-sm bg-black border border-zinc-800 text-white placeholder:text-zinc-600"
              />

              <input
                type="number"
                min={0}
                max={5000}
                value={minVoteCount}
                onChange={(e) => setMinVoteCount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="أدنى عدد أصوات (10)"
                title="أعمال أقل شهرة عالميًا (مصرية/خليجية...) عادة ما يكون عدد الأصوات عليها في TMDB منخفضًا جدًا - اخفضه أكثر إن لم تظهر نتائج كافية."
                className="px-3 py-2 rounded-lg text-sm bg-black border border-zinc-800 text-white placeholder:text-zinc-600"
              />

              <button
                type="button"
                onClick={() => void search()}
                disabled={searching}
                className="col-span-2 md:col-span-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                بحث
              </button>
            </div>

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
            {message && <p className="text-sm text-emerald-400 mb-4">{message}</p>}

            {searched && results.length === 0 && !searching && (
              <p className="text-sm text-zinc-500">لا توجد نتائج مطابقة لهذه المعايير.</p>
            )}

            {results.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-500 font-semibold">
                    {selected.size} محدد من {results.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => void importSelected()}
                    disabled={importing || selected.size === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-colors disabled:opacity-40"
                  >
                    {importing && <Loader2 size={14} className="animate-spin" />}
                    استيراد المحدد ({selected.size})
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {results.map((r) => (
                    <label
                      key={r.tmdbId}
                      className={`relative rounded-xl overflow-hidden border cursor-pointer transition-colors ${
                        selected.has(r.tmdbId)
                          ? 'border-white'
                          : 'border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="absolute top-2 right-2 accent-white z-10"
                        checked={selected.has(r.tmdbId)}
                        onChange={() => toggle(r.tmdbId)}
                      />
                      {r.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.poster}
                          alt=""
                          className="w-full aspect-[2/3] object-cover bg-zinc-900"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-zinc-900" />
                      )}
                      <div className="p-2.5">
                        <div className="text-xs font-bold truncate">{r.title}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {r.releaseDate ? r.releaseDate.slice(0, 4) : '—'} · ★{' '}
                          {r.rating.toFixed(1)} ({r.voteCount})
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={searching}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-white/5 border border-zinc-800 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {searching && <Loader2 size={14} className="animate-spin" />}
                  تحميل المزيد
                </button>
              </>
            )}
          </>
        )}

        {source === 'archive' && (
          <>
            <div className="bg-white/5 border border-zinc-800 rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <input
                value={archiveQuery}
                onChange={(e) => setArchiveQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchArchive();
                  }
                }}
                placeholder="اسم الفيلم (اختياري - اتركه فارغًا للتصفح)"
                className="col-span-2 px-3 py-2 rounded-lg text-sm bg-black border border-zinc-800 text-white placeholder:text-zinc-600"
              />

              <select
                value={archiveSortBy}
                onChange={(e) => setArchiveSortBy(e.target.value as 'downloads' | 'addeddate')}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white"
              >
                <option value="downloads">الأشهر</option>
                <option value="addeddate">الأحدث إضافةً للأرشيف</option>
              </select>

              <select
                value={archiveGenre}
                onChange={(e) => setArchiveGenre(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white"
              >
                <option value="">كل التصنيفات</option>
                {ARCHIVE_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={archiveLanguage}
                onChange={(e) => setArchiveLanguage(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-black border border-zinc-800 text-white"
              >
                <option value="">كل اللغات</option>
                {ARCHIVE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void searchArchive()}
                disabled={searchingArchive}
                className="col-span-2 md:col-span-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {searchingArchive ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}
                بحث
              </button>
            </div>

            <p className="text-xs text-zinc-600 mb-4">
              بدون اسم فيلم، يعرض هذا الأشهر/الأحدث المتوفر في المكتبة حسب الفلاتر المختارة - كل
              نتيجة تُطابَق تلقائيًا مع TMDB لجلب بيانات حقيقية (ملصق، قصة). العناصر بدون ترخيص
              ملكية عامة موثّق أو بدون تطابق في TMDB لا يمكن تحديدها.
            </p>

            {archiveError && <p className="text-sm text-red-400 mb-4">{archiveError}</p>}
            {archiveMessage && <p className="text-sm text-emerald-400 mb-4">{archiveMessage}</p>}

            {archiveSearched && archiveResults.length === 0 && !searchingArchive && (
              <p className="text-sm text-zinc-500">لا توجد نتائج مطابقة.</p>
            )}

            {archiveResults.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-500 font-semibold">
                    {archiveSelected.size} محدد من {archiveResults.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => void importSelectedArchive()}
                    disabled={importingArchive || archiveSelected.size === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-colors disabled:opacity-40"
                  >
                    {importingArchive && <Loader2 size={14} className="animate-spin" />}
                    استيراد المحدد ({archiveSelected.size})
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {archiveResults.map((r) => {
                    const disabled =
                      !r.isRecognizedOpenLicense || !r.hasPlayableFile || !r.matchedTmdbId;
                    return (
                      <label
                        key={r.identifier}
                        className={`relative rounded-xl overflow-hidden border transition-colors ${
                          disabled
                            ? 'border-zinc-800 opacity-40 cursor-not-allowed'
                            : archiveSelected.has(r.identifier)
                              ? 'border-white cursor-pointer'
                              : 'border-zinc-800 hover:border-zinc-600 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="absolute top-2 right-2 accent-white z-10"
                          checked={archiveSelected.has(r.identifier)}
                          disabled={disabled}
                          onChange={() => toggleArchive(r.identifier)}
                        />
                        {r.matchedPoster || r.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.matchedPoster ?? r.thumbnailUrl ?? ''}
                            alt=""
                            className="w-full aspect-[2/3] object-cover bg-zinc-900"
                          />
                        ) : (
                          <div className="w-full aspect-[2/3] bg-zinc-900" />
                        )}
                        <div className="p-2.5">
                          <div className="text-xs font-bold truncate">{r.title}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{r.year ?? '—'}</div>
                          {r.isRecognizedOpenLicense ? (
                            <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-1">
                              <ShieldCheck size={11} />
                              ملكية عامة
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[11px] text-red-400 font-semibold mt-1">
                              <ShieldAlert size={11} />
                              بدون ترخيص
                            </div>
                          )}
                          {!r.matchedTmdbId && r.isRecognizedOpenLicense && (
                            <div className="text-[11px] text-zinc-500 mt-1">لا تطابق في TMDB</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => void loadMoreArchive()}
                  disabled={searchingArchive}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-white/5 border border-zinc-800 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {searchingArchive && <Loader2 size={14} className="animate-spin" />}
                  تحميل المزيد
                </button>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
