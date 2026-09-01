import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Film, Loader2, Plus, Search, Tv, X } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type { AdminFeaturedItemDto, AdminMovieSummaryDto, AdminShowSummaryDto } from '../lib/types';

type SearchResult =
  (AdminMovieSummaryDto & { type: 'movie' }) | (AdminShowSummaryDto & { type: 'show' });

export default function BannerPage() {
  const { isLoading, user } = useAuth();
  const [featured, setFeatured] = useState<AdminFeaturedItemDto[]>([]);
  const [searchType, setSearchType] = useState<'movie' | 'show'>('movie');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    adminService
      .listFeatured()
      .then(setFeatured)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل البنر الحالي.'));
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setError(null);
    try {
      if (searchType === 'movie') {
        const result = await adminService.listMovies({ search: search.trim(), limit: 10 });
        setResults(result.items.map((m) => ({ ...m, type: 'movie' as const })));
      } else {
        const result = await adminService.listShows({ search: search.trim(), limit: 10 });
        setResults(result.items.map((s) => ({ ...s, type: 'show' as const })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل البحث.');
    } finally {
      setSearching(false);
    }
  }

  function addItem(item: SearchResult) {
    if (featured.some((f) => f.id === item.id && f.type === item.type)) return;
    setFeatured((prev) => [...prev, item]);
    setMessage(null);
  }

  function removeItem(id: string, type: 'movie' | 'show') {
    setFeatured((prev) => prev.filter((f) => !(f.id === id && f.type === type)));
  }

  function move(index: number, direction: -1 | 1) {
    setFeatured((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminService.setFeatured(featured.map((f) => ({ id: f.id, type: f.type })));
      setMessage('تم حفظ ترتيب البنر.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ البنر.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">البنر الرئيسي</h1>
      <p className="text-sm text-zinc-500 mb-6">
        اختر الأفلام والمسلسلات التي تظهر في البنر المتحرك بالصفحة الرئيسية ورتّبها.
      </p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {message && <p className="text-sm text-emerald-400 mb-4">{message}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-black mb-4">الترتيب الحالي ({featured.length})</h2>
          {featured.length === 0 ? (
            <p className="text-xs text-zinc-600 mb-2">
              لا يوجد بنر مخصّص بعد - سيعرض التطبيق أحدث الأفلام تلقائيًا حتى تختار هنا.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {featured.map((f, i) => (
                <div
                  key={`${f.type}-${f.id}`}
                  className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-3 py-2.5"
                >
                  <span className="shrink-0 w-5 text-center text-xs text-zinc-500 font-bold">
                    {i + 1}
                  </span>
                  {f.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.poster}
                      alt=""
                      className="w-8 h-11 object-cover rounded bg-zinc-900 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-11 rounded bg-zinc-900 shrink-0" />
                  )}
                  {f.type === 'show' ? (
                    <Tv size={12} className="shrink-0 text-zinc-500" />
                  ) : (
                    <Film size={12} className="shrink-0 text-zinc-500" />
                  )}
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">{f.title}</span>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-20"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={i === featured.length - 1}
                    onClick={() => move(i, 1)}
                    className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-20"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(f.id, f.type)}
                    className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            حفظ الترتيب
          </button>
        </section>

        <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-sm font-black mb-4">إضافة إلى البنر</h2>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                setSearchType('movie');
                setResults([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                searchType === 'movie'
                  ? 'bg-white text-black'
                  : 'bg-black border border-zinc-800 text-zinc-400'
              }`}
            >
              <Film size={12} />
              أفلام
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchType('show');
                setResults([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                searchType === 'show'
                  ? 'bg-white text-black'
                  : 'bg-black border border-zinc-800 text-zinc-400'
              }`}
            >
              <Tv size={12} />
              مسلسلات
            </button>
          </div>
          <form onSubmit={submitSearch} className="flex gap-2 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchType === 'movie' ? 'ابحث عن فيلم...' : 'ابحث عن مسلسل...'}
                className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 pr-9 pl-3 text-sm outline-none focus:border-zinc-600"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {searching ? <Loader2 size={13} className="animate-spin" /> : 'بحث'}
            </button>
          </form>

          {results.length === 0 ? (
            <p className="text-xs text-zinc-600">ابحث لإضافته إلى البنر.</p>
          ) : (
            <div className="space-y-2">
              {results.map((item) => {
                const already = featured.some((f) => f.id === item.id && f.type === item.type);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-3 py-2.5"
                  >
                    {item.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.poster}
                        alt=""
                        className="w-8 h-11 object-cover rounded bg-zinc-900 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-11 rounded bg-zinc-900 shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                      {item.title}
                    </span>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => addItem(item)}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-30"
                    >
                      <Plus size={12} />
                      {already ? 'مضاف' : 'إضافة'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
