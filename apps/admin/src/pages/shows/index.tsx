import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { AdminLayout } from '../../components/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import type { AdminShowFilterOptions, AdminShowSummaryDto, PaginationMeta } from '../../lib/types';

// REMOVED, not "ARCHIVED" - see UpdateShowDto's own comment in the backend.
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

export default function ShowsPage() {
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const [shows, setShows] = useState<AdminShowSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('');
  const [availability, setAvailability] = useState<'' | 'no-stream' | 'no-subtitle'>('');
  const [status, setStatus] = useState('');
  const [filterOptions, setFilterOptions] = useState<AdminShowFilterOptions>({
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

  // Same filters-in-the-URL approach as the movies list (see its own comment) - lets going back
  // from a show's detail page land on the same filtered/searched view instead of a blank one.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!router.isReady || hydrated) return;
    setPage(Number(router.query.page) || 1);
    setSearch(queryString(router.query.search));
    setGenre(queryString(router.query.genre));
    setLanguage(queryString(router.query.language));
    const avail = queryString(router.query.availability);
    setAvailability(avail === 'no-stream' || avail === 'no-subtitle' ? avail : '');
    setStatus(queryString(router.query.status));
    setHydrated(true);
  }, [router.isReady, router.query, hydrated]);

  function load() {
    adminService
      .listShows({
        page,
        limit: 20,
        search: search || undefined,
        genre: genre || undefined,
        language: language || undefined,
        missingStream: availability === 'no-stream' ? true : undefined,
        missingSubtitle: availability === 'no-subtitle' ? true : undefined,
        status: status || undefined,
      })
      .then((result) => {
        setShows(result.items);
        setMeta(result.meta);
        setSelected(new Set());
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل المسلسلات.'));
  }

  useEffect(() => {
    if (user) {
      adminService
        .listShowFilterOptions()
        .then(setFilterOptions)
        .catch(() => {});
    }
  }, [user]);

  function syncUrl(nextPage: number) {
    router.replace(
      {
        pathname: '/shows',
        query: {
          ...(nextPage > 1 ? { page: nextPage } : {}),
          ...(search ? { search } : {}),
          ...(genre ? { genre } : {}),
          ...(language ? { language } : {}),
          ...(availability ? { availability } : {}),
          ...(status ? { status } : {}),
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
  }, [user, hydrated, page, genre, language, availability, status]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (page !== 1) {
      setPage(1);
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
      await adminService.importShow(newTmdbId.trim());
      setNewTmdbId('');
      setMessage('تم استيراد المسلسل بنجاح.');
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
      await adminService.reimportShow(id);
      setMessage('تم تحديث معلومات المسلسل وحلقاته.');
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
      await adminService.deleteShow(id);
      setMessage('تم حذف المسلسل.');
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
        await adminService.reimportShow(id);
        done++;
      } catch {
        // Continue with the rest of the selection - one failure shouldn't abort the batch.
      }
    }
    setMessage(`تم تحديث ${done} من ${ids.length} مسلسلًا محددًا.`);
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
      prev.size === shows.length ? new Set() : new Set(shows.map((s) => s.id)),
    );
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">المسلسلات</h1>
      <p className="text-sm text-zinc-500 mb-6">
        استيراد مسلسلات جديدة، وتعديل أو حذف أو إعادة استيراد المسلسلات الحالية.
      </p>

      <form
        onSubmit={submitImport}
        className="mb-6 flex items-end gap-2 flex-wrap bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] text-zinc-500 mb-1">
            استيراد مسلسل جديد (رقم TMDB)
          </label>
          <input
            dir="ltr"
            value={newTmdbId}
            onChange={(e) => setNewTmdbId(e.target.value)}
            placeholder="مثال: 1399"
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
          value={availability}
          onChange={(e) => {
            setPage(1);
            setAvailability(e.target.value as typeof availability);
          }}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
        >
          <option value="">كل الحالات</option>
          <option value="no-stream">توجد حلقة بدون رابط تشغيل</option>
          <option value="no-subtitle">توجد حلقة بدون ترجمة</option>
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

      {shows.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500 text-sm">
          لا توجد مسلسلات مطابقة.
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800">
            <input
              type="checkbox"
              checked={selected.size === shows.length}
              onChange={toggleSelectAll}
              className="accent-white"
            />
            <span className="text-[11px] text-zinc-500 font-semibold">
              تحديد الكل في هذه الصفحة
            </span>
          </div>
          {shows.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleSelected(s.id)}
                className="accent-white shrink-0"
              />
              <Link
                href={`/shows/${s.id}`}
                className="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                {s.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.poster}
                    alt=""
                    className="w-9 h-13 object-cover rounded-md bg-zinc-900"
                  />
                ) : (
                  <div className="w-9 h-13 rounded-md bg-zinc-900 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    {s.titleAr || '—'} · {s.releaseDate ? s.releaseDate.slice(0, 4) : '—'} ·{' '}
                    {s.numberOfSeasons} موسم · {s.numberOfEpisodes} حلقة
                    {s.rating != null && ` · ★ ${s.rating.toFixed(1)}`}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                    s.status === 'PUBLISHED'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : s.status === 'REMOVED' || s.status === 'INACTIVE'
                        ? 'bg-zinc-800 text-zinc-400'
                        : 'bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.hasIncompleteEpisodes && (
                  <span
                    className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400"
                    title="توجد حلقة واحدة أو أكثر بدون رابط تشغيل أو ترجمة"
                  >
                    ناقص
                  </span>
                )}
              </Link>
              <button
                type="button"
                disabled={busyId === s.id}
                onClick={() => void reimport(s.id)}
                title="إعادة استيراد المعلومات"
                className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {busyId === s.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </button>
              <button
                type="button"
                disabled={busyId === s.id}
                onClick={() => void remove(s.id, s.title)}
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
