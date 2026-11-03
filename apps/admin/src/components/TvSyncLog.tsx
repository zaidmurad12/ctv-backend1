import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Download, Loader2, RefreshCw, Tv } from 'lucide-react';
import { adminService, type TvSyncLog as TvSyncLogData } from '../services/adminService';

// What the TVs did with the sources' "newly added" lists (sent once a day by each TV - see the
// backend's admin/sourceLatest.ts): titles linked to works we already had, titles imported from
// TMDB, and titles that couldn't be matched. Newest first.
const METHOD_LABEL: Record<string, string> = {
  'tv-imdb': 'تطابق بمعرف IMDb',
  'tv-title': 'تطابق بالاسم والسنة',
  'tv-import': 'استيراد جديد من TMDB',
  'tv-noref': 'بلا معرف IMDb في المصدر',
  'tv-notmdb': 'غير موجود في TMDB',
};

type Filter = 'all' | 'matched' | 'imported' | 'unmatched';

export function TvSyncLog() {
  const [data, setData] = useState<TvSyncLogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = () => {
    setLoading(true);
    setError('');
    adminService
      .sourceCheckTvLog(200)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'تعذر تحميل السجل'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const items = (data?.items ?? []).filter((i) =>
    filter === 'all'
      ? true
      : filter === 'imported'
        ? i.method === 'tv-import'
        : filter === 'matched'
          ? i.status === 'MATCHED' && i.method !== 'tv-import'
          : i.status !== 'MATCHED',
  );

  return (
    <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Tv size={16} className="text-white" />
        <h2 className="text-sm font-black text-white">توافق من أجهزة التلفاز</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="mr-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          تحديث
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        يرسل كل جهاز مرة يومياً قائمة "المضاف حديثاً" من سينمانا: العمل الموجود يُعلَّم متوافقاً
        (ويُنشر إن كان مسودة)، وغير الموجود يُستورد من TMDB بمعرف IMDb.
      </p>
      {data && (
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="text-emerald-400">
            تطابق (24 ساعة): <b>{data.stats.matched24h}</b>
          </span>
          <span className="text-sky-400">
            استيراد (24 ساعة): <b>{data.stats.imported24h}</b>
          </span>
          <span className="text-red-400">
            لم يتطابق (24 ساعة): <b>{data.stats.unmatched24h}</b>
          </span>
          <span className="text-zinc-400">
            المجموع: <b className="text-white">{data.stats.total}</b>
          </span>
        </div>
      )}
      <div className="flex gap-2 text-xs">
        {(
          [
            ['all', 'الكل'],
            ['matched', 'متطابقة'],
            ['imported', 'مستوردة'],
            ['unmatched', 'لم تتطابق'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg border ${filter === key ? 'bg-white text-black border-white' : 'border-zinc-800 text-zinc-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="rounded-lg border border-zinc-900 divide-y divide-zinc-900 max-h-[480px] overflow-y-auto">
        {!loading && items.length === 0 && (
          <p className="p-4 text-xs text-zinc-500">لا توجد أعمال بعد.</p>
        )}
        {items.map((i) => {
          const href = i.target
            ? i.kind === 'movie'
              ? `/movies/${i.target.id}`
              : `/shows/${i.target.id}`
            : undefined;
          const Row = href ? 'a' : 'div';
          return (
            <Row
              key={`${i.kind}:${i.nb}`}
              {...(href ? { href } : {})}
              className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-zinc-900"
            >
              {i.method === 'tv-import' ? (
                <Download size={14} className="text-sky-400 shrink-0" />
              ) : i.status === 'MATCHED' ? (
                <CircleCheck size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <CircleX size={14} className="text-red-400 shrink-0" />
              )}
              <span className="text-white font-semibold">
                {i.target?.titleAr || i.arTitle || i.target?.title || i.enTitle}
              </span>
              <span className="text-zinc-500">{i.enTitle}</span>
              <span className="text-zinc-600">{i.year ?? ''}</span>
              <span className="text-zinc-600">{i.kind === 'movie' ? 'فيلم' : 'مسلسل'}</span>
              <span className="text-zinc-600">سينمانا #{i.nb}</span>
              <span className="mr-auto text-zinc-400">
                {METHOD_LABEL[i.method ?? ''] ?? i.method}
              </span>
              <span className="text-zinc-600" dir="ltr">
                {new Date(i.at).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
