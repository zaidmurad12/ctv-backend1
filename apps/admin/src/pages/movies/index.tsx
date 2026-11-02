import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { AdminLayout } from '../../components/Sidebar';
import { CompatMarkButtons } from '../../components/CompatMarkButtons';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import type {
  AdminMovieFilterOptions,
  AdminMovieSummaryDto,
  PaginationMeta,
} from '../../lib/types';

// REMOVED, not "ARCHIVED" - see UpdateMovieDto's own comment in the backend: the schema's
// MovieStatusEnum has never actually had an ARCHIVED member, so saving that value used to pass
// this UI's own dropdown fine and then fail at the database.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  PENDING: 'قيد الانتظار',
  PUBLISHED: 'منشور',
  REMOVED: 'مؤرشف',
  INACTIVE: 'غير نشط',
};

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function MoviesPage() {
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const [movies, setMovies] = useState<AdminMovieSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState('');
  const [availability, setAvailability] = useState<'' | 'has-stream' | 'no-stream' | 'no-subtitle'>('');
  // A separate control from availability on purpose - "has a stream" and "has a confirmed source
  // match" aren't opposite ends of the same axis (a streamless movie can still have a real match;
  // see ScheduledImportService's own sourceMatchCheck), so forcing them into one dropdown would
  // make some real combinations (streamless + matched, the exact case worth finding) unreachable.
  const [sourceMatch, setSourceMatch] = useState<'' | 'has-match' | 'no-match'>('');
  const [status, setStatus] = useState('');
  // A third, independent axis - a movie can be missing its Arabic title, its artwork, both, or
  // neither, regardless of stream/source-match status. See AdminMoviesRepository.list's own
  // comment for why titleAr specifically matters for CEE/Cinemana source matching, not just
  // display - this is what surfaces that gap for an admin to close (see the new backfill job,
  // backfill-arabic-titles.mjs, for closing it automatically).
  const [contentGap, setContentGap] = useState<'' | 'no-arabic-title' | 'no-artwork'>('');
  const [filterOptions, setFilterOptions] = useState<AdminMovieFilterOptions>({
    genres: [],
    languages: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [importing, setImporting] = useState(false);

  // Filters/search/page live in the URL (?search=&genre=&language=&availability=&page=) so that
  // going back from a movie's detail page (a plain browser-history back, see [id].tsx) lands on
  // this exact same filtered/searched view instead of resetting to a blank list - previously
  // every "من صفحة عمل معين نعود لواجهة الاعمال" round trip lost whatever the admin had filtered
  // or searched for. Hydrated once router.query is available (Next.js's client-side router
  // starts with an empty query object before that), then kept in sync on every change after.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!router.isReady || hydrated) return;
    setPage(Number(router.query.page) || 1);
    setSearch(queryString(router.query.search));
    setGenre(queryString(router.query.genre));
    setLanguage(queryString(router.query.language));
    setSort(queryString(router.query.sort));
    const avail = queryString(router.query.availability);
    setAvailability(avail === 'has-stream' || avail === 'no-stream' || avail === 'no-subtitle' ? avail : '');
    const match = queryString(router.query.sourceMatch);
    setSourceMatch(match === 'has-match' || match === 'no-match' ? match : '');
    setStatus(queryString(router.query.status));
    const gap = queryString(router.query.contentGap);
    setContentGap(gap === 'no-arabic-title' || gap === 'no-artwork' ? gap : '');
    setHydrated(true);
  }, [router.isReady, router.query, hydrated]);

  function load() {
    adminService
      .listMovies({
        page,
        limit: 20,
        search: search || undefined,
        genre: genre || undefined,
        language: language || undefined,
        sort: sort || undefined,
        hasStream: availability === 'has-stream' ? true : availability === 'no-stream' ? false : undefined,
        hasSubtitle: availability === 'no-subtitle' ? false : undefined,
        hasSourceMatch: sourceMatch === 'has-match' ? true : sourceMatch === 'no-match' ? false : undefined,
        status: status || undefined,
        missingArabicTitle: contentGap === 'no-arabic-title' ? true : undefined,
        missingArtwork: contentGap === 'no-artwork' ? true : undefined,
      })
      .then((result) => {
        setMovies(result.items);
        setMeta(result.meta);
        setSelected(new Set());
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل الأعمال.'));
  }

  useEffect(() => {
    if (user) {
      adminService
        .listMovieFilterOptions()
        .then(setFilterOptions)
        .catch(() => {});
    }
  }, [user]);

  // Shallow + replace: reflects the current filters in the URL without adding a fresh history
  // entry per keystroke/filter change, so the back button above still only ever needs one step.
  // `search` is deliberately read fresh from the DOM-driven state at call time rather than being
  // a dependency of the effect below - search is submit-triggered (see submitSearch), not
  // live-as-you-type, so this only needs to fire when page/genre/language/availability change on
  // their own; submitSearch calls it directly for the search-submitted case.
  function syncUrl(nextPage: number) {
    router.replace(
      {
        pathname: '/movies',
        query: {
          ...(nextPage > 1 ? { page: nextPage } : {}),
          ...(search ? { search } : {}),
          ...(genre ? { genre } : {}),
          ...(language ? { language } : {}),
          ...(sort ? { sort } : {}),
          ...(availability ? { availability } : {}),
          ...(sourceMatch ? { sourceMatch } : {}),
          ...(status ? { status } : {}),
          ...(contentGap ? { contentGap } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  }

  useEffect(() => {
    if (!user || !hydrated) return;
    load();
    syncUrl(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hydrated, page, genre, language, sort, availability, sourceMatch, status, contentGap]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (page !== 1) {
      setPage(1); // Triggers the effect above, which calls load()/syncUrl() with the new search text.
      return;
    }
    load();
    syncUrl(1);
  }

  async function submitImport(event: React.FormEvent) {
    event.preventDefault();
    if (!newTmdbId.trim()) return;
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      await adminService.importMovie(newTmdbId.trim());
      setNewTmdbId('');
      setMessage('تم استيراد العمل بنجاح.');
      setPage(1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاستيراد. تأكد من صحة رقم TMDB.');
    } finally {
      setImporting(false);
    }
  }

  async function reimport(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await adminService.reimportMovie(id);
      setMessage('تم تحديث معلومات العمل.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إعادة الاستيراد.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`حذف "${title}"؟ يمكن استرجاعه لاحقًا من قاعدة البيانات فقط.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await adminService.deleteMovie(id);
      setMessage('تم حذف العمل.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف.');
    } finally {
      setBusyId(null);
    }
  }

  async function bulkReimport() {
    setBulkBusy(true);
    setError(null);
    const ids = [...selected];
    let done = 0;
    for (const id of ids) {
      try {
        await adminService.reimportMovie(id);
        done++;
      } catch {
        // Continue with the rest of the selection - one failure shouldn't abort the batch.
      }
    }
    setMessage(`تم تحديث ${done} من ${ids.length} عملًا محددًا.`);
    setBulkBusy(false);
    load();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === movies.length ? new Set() : new Set(movies.map((m) => m.id)),
    );
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">الأعمال</h1>
      <p className="text-sm text-zinc-500 mb-6">
        استيراد أعمال جديدة، وتعديل أو حذف أو إعادة استيراد الأعمال الحالية.
      </p>

      <form
        onSubmit={submitImport}
        className="mb-6 flex items-end gap-2 flex-wrap bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] text-zinc-500 mb-1">
            استيراد عمل جديد (رقم TMDB)
          </label>
          <input
            dir="ltr"
            value={newTmdbId}
            onChange={(e) => setNewTmdbId(e.target.value)}
            placeholder="مثال: 27205"
            className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
          />
        </div>
        <button
          type="submit"
          disabled={importing}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {importing ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          استيراد
        </button>
      </form>

      <form onSubmit={submitSearch} className="mb-4 flex gap-2 flex-wrap items-end">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالعنوان..."
            className="w-full bg-black border border-zinc-800 rounded-lg py-2 pr-9 pl-3 text-sm outline-none focus:border-zinc-600"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
        >
          بحث
        </button>

        <select
          value={genre}
          onChange={(e) => {
            setPage(1);
            setGenre(e.target.value);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">كل التصنيفات</option>
          {filterOptions.genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={language}
          onChange={(e) => {
            setPage(1);
            setLanguage(e.target.value);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">كل اللغات</option>
          {filterOptions.languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">الأحدث إصداراً</option>
          <option value="rating">الأعلى تقييماً</option>
          <option value="rating-asc">الأقل تقييماً</option>
          <option value="oldest">الأقدم إصداراً</option>
          <option value="popularity">الأكثر شهرة</option>
        </select>

        <select
          value={availability}
          onChange={(e) => {
            setPage(1);
            setAvailability(e.target.value as typeof availability);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">كل الحالات</option>
          <option value="has-stream">يمتلك رابط تشغيل</option>
          <option value="no-stream">بدون رابط تشغيل</option>
          <option value="no-subtitle">بدون ترجمة</option>
        </select>

        <select
          value={sourceMatch}
          onChange={(e) => {
            setPage(1);
            setSourceMatch(e.target.value as typeof sourceMatch);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
          title="مطابقة مؤكدة مع CEE/Cinemana حتى لو لم يُرفع رابط تشغيل بعد - يُفحص فقط للأعمال بدون رابط تشغيل"
        >
          <option value="">كل أعمال التوافق</option>
          <option value="has-match">يمتلك توافق مع المصادر</option>
          <option value="no-match">لا يمتلك توافق مع المصادر</option>
        </select>

        <select
          value={contentGap}
          onChange={(e) => {
            setPage(1);
            setContentGap(e.target.value as typeof contentGap);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
          title="الاسم العربي يؤثر على دقة مطابقة المصادر أيضاً، وليس فقط على العرض"
        >
          <option value="">كل الأعمال (اسم وصور)</option>
          <option value="no-arabic-title">بدون اسم عربي</option>
          <option value="no-artwork">بدون شعار أو خلفية</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">كل الأعمال (منشور + مسودة)</option>
          <option value="PUBLISHED">منشور فقط</option>
          <option value="DRAFT">مسودة فقط</option>
        </select>
      </form>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {message && <p className="text-sm text-emerald-400 mb-4">{message}</p>}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-white/5 border border-zinc-800 rounded-xl px-4 py-2.5">
          <span className="text-xs text-zinc-300 font-semibold">{selected.size} عنصر محدد</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkReimport()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            إعادة استيراد المعلومات للمحدد
          </button>
        </div>
      )}

      {movies.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500 text-sm">
          لا توجد أعمال مطابقة.
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800">
            <input
              type="checkbox"
              checked={selected.size === movies.length}
              onChange={toggleSelectAll}
              className="accent-white"
            />
            <span className="text-[11px] text-zinc-500 font-semibold">
              تحديد الكل في هذه الصفحة
            </span>
          </div>
          {movies.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggleSelected(m.id)}
                className="accent-white shrink-0"
              />
              <Link
                href={`/movies/${m.id}`}
                className="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                {m.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.poster}
                    alt=""
                    className="w-9 h-13 object-cover rounded-md bg-zinc-900"
                  />
                ) : (
                  <div className="w-9 h-13 rounded-md bg-zinc-900 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{m.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    {m.titleAr || '—'} · {m.releaseDate ? m.releaseDate.slice(0, 4) : '—'}
                    {m.rating != null && ` · ★ ${m.rating.toFixed(1)}`}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                    m.status === 'PUBLISHED'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : m.status === 'REMOVED' || m.status === 'INACTIVE'
                        ? 'bg-zinc-800 text-zinc-400'
                        : 'bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
                <span
                  className={`shrink-0 flex items-center gap-1 text-[11px] font-bold ${
                    m.hasPlayableStream ? 'text-emerald-400' : 'text-zinc-600'
                  }`}
                  title={m.hasPlayableStream ? 'يملك رابط تشغيل فعّال' : 'قريبًا — بدون رابط تشغيل'}
                >
                  <PlayCircle size={14} />
                  {m.hasPlayableStream ? 'جاهز' : 'قريبًا'}
                </span>
                {!m.hasSubtitles && m.originalLanguage !== 'ar' && (
                  <span className="shrink-0 text-[11px] font-bold text-zinc-600">بدون ترجمة</span>
                )}
              </Link>
              <CompatMarkButtons
                value={m.hasSourceMatch}
                onSet={async (next) => {
                  await adminService.updateMovie(m.id, { hasSourceMatch: next });
                  load();
                }}
              />
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => void reimport(m.id)}
                title="إعادة استيراد المعلومات"
                className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {busyId === m.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </button>
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => void remove(m.id, m.title)}
                title="حذف"
                className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            type="button"
            disabled={!meta.hasPrevious}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-lg border border-zinc-800 disabled:opacity-30 hover:bg-zinc-900 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-xs text-zinc-500">
            صفحة {meta.page} من {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={!meta.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-lg border border-zinc-800 disabled:opacity-30 hover:bg-zinc-900 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
