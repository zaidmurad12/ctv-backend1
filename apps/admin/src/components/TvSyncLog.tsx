import { useEffect, useRef, useState } from 'react';
import {
  CircleCheck,
  CircleX,
  Download,
  Loader2,
  RefreshCw,
  ScanSearch,
  Square,
  Tv,
} from 'lucide-react';
import { adminService, type TvSyncLog as TvSyncLogData } from '../services/adminService';
import { catalogPage, SOURCE_LABEL, type SourceKind, type SourceName } from '../lib/sourceCatalog';

// What the TVs did with the sources' "newly added" lists (sent once a day by each TV - see the
// backend's admin/sourceLatest.ts): titles linked to works we already had, titles imported from
// TMDB, and titles that couldn't be matched. Newest first.
const METHOD_LABEL: Record<string, string> = {
  'tv-imdb': 'تطابق بمعرف IMDb',
  'tv-title': 'تطابق بالاسم والسنة',
  'tv-import': 'استيراد جديد من TMDB',
  'tv-noref': 'بلا معرف IMDb في المصدر',
  'tv-notmdb': 'غير موجود في TMDB',
  'tv-notitle': 'غير موجود في TMDB',
};
const KIND_LABEL: Record<SourceKind, string> = { movie: 'أفلام', series: 'مسلسلات' };

// How far the "check the newest" button got in each list (next page to read), in this browser only.
const REACHED_KEY = 'ctv.latestCheck.reached';
function loadReached(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(REACHED_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function saveReached(key: string, page: number) {
  try {
    localStorage.setItem(REACHED_KEY, JSON.stringify({ ...loadReached(), [key]: page }));
  } catch {
    // Private window or blocked storage: the check still works, it just can't continue later.
  }
}

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

  // "Check the newest now": this browser (in Iraq) reads both sources' newest films and series,
  // page by page (24 titles each), and the server handles them exactly like a TV's report (without
  // the TVs' daily caps). "Continue" starts each list at the page the last run reached (kept in this
  // browser); new additions only push titles to later pages, so nothing is skipped - at most a few
  // titles are seen twice, and the server passes over those at once.
  const [checking, setChecking] = useState(false);
  const [pagesWanted, setPagesWanted] = useState('5');
  const [resume, setResume] = useState(false);
  const [reached, setReached] = useState<Record<string, number>>({});
  const [checkLines, setCheckLines] = useState<Array<{ text: string; warn?: boolean }>>([]);
  const stopRef = useRef(false);
  useEffect(() => setReached(loadReached()), []);
  async function checkLatest() {
    stopRef.current = false;
    setChecking(true);
    setCheckLines([]);
    const say = (text: string, warn = false) =>
      setCheckLines((l) => [...l.slice(-300), { text, warn }]);
    const pages = Math.min(Math.max(Math.floor(Number(pagesWanted)) || 1, 1), 500);
    const total = { matched: 0, imported: 0, noMatch: 0, skipped: 0 };
    outer: for (const source of ['cinemana', 'cee'] as SourceName[]) {
      for (const kind of ['movie', 'series'] as SourceKind[]) {
        const label = `${SOURCE_LABEL[source]} - ${KIND_LABEL[kind]}`;
        const key = `${source}:${kind}`;
        const first = resume ? (loadReached()[key] ?? 0) : 0;
        let retries = 0;
        for (let page = first; page < first + pages; page++) {
          if (stopRef.current) break outer;
          let titles;
          try {
            titles = await catalogPage(source, kind, page);
          } catch {
            say(`${label}: تعذّر الوصول إلى المصدر (يجب فتح اللوحة من داخل العراق).`, true);
            break;
          }
          if (!titles.length) {
            say(`${label}: انتهت القائمة عند الصفحة ${page}.`);
            saveReached(key, 0);
            setReached(loadReached());
            break;
          }
          try {
            const r = await adminService.checkLatestNow(titles);
            total.matched += r.matched;
            total.imported += r.imported;
            total.noMatch += r.noMatch;
            total.skipped += r.skipped;
            say(
              `${label} صفحة ${page + 1}: تطابق ${r.matched}، استيراد ${r.imported}، لم يُعثر عليه ${r.noMatch}، سبق فحصه ${r.skipped}` +
                (r.dbFull ? ' (قاعدة البيانات ممتلئة - لا استيراد)' : ''),
              r.dbFull,
            );
            // Only a fully handled page counts as reached (a full database left titles out).
            if (r.dbFull) break outer;
            // The server stops a request after ~3 minutes; the rest of the page is sent again.
            const handled = r.matched + r.imported + r.noMatch + r.skipped;
            if (handled < titles.length && retries < 3) {
              retries++;
              say(`${label} صفحة ${page + 1}: لم تكتمل (${handled} من ${titles.length}) - تُعاد.`);
              page--;
              continue;
            }
            retries = 0;
            saveReached(key, page + 1);
            setReached(loadReached());
          } catch (e) {
            say(
              `${label} صفحة ${page + 1}: فشل الإرسال إلى الخادم - ${e instanceof Error ? e.message : String(e)}`,
              true,
            );
            break;
          }
        }
      }
    }
    say(
      `${stopRef.current ? 'توقف' : 'انتهى'} - المجموع: تطابق ${total.matched}، استيراد ${total.imported}، لم يُعثر عليه ${total.noMatch}، سبق فحصه ${total.skipped}`,
    );
    setChecking(false);
    load();
  }

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
        {checking ? (
          <button
            type="button"
            onClick={() => (stopRef.current = true)}
            className="mr-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10"
          >
            <Square size={11} />
            إيقاف الفحص
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void checkLatest()}
            className="mr-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-black bg-white hover:bg-zinc-200"
          >
            <ScanSearch size={12} />
            فحص الأحدث إضافة الآن (سينمانا وسي)
          </button>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          تحديث
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        يرسل كل جهاز كل بضع ساعات قائمة "المضاف حديثاً" من سينمانا وسي: العمل الموجود يُعلَّم
        متوافقاً (ويُنشر إن كان مسودة)، وغير الموجود يُستورد من TMDB بمعرف IMDb أو بالاسم والسنة. زر
        «فحص الأحدث» يفعل الشيء نفسه فوراً من هذا المتصفح.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <label className="flex items-center gap-2">
          عدد الصفحات لكل قائمة (24 عملاً للصفحة):
          <input
            value={pagesWanted}
            onChange={(e) => setPagesWanted(e.target.value)}
            disabled={checking}
            inputMode="numeric"
            className="w-16 bg-black border border-zinc-800 rounded-lg px-2 py-1 text-white"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={resume}
            onChange={(e) => setResume(e.target.checked)}
            disabled={checking}
          />
          أكمل من حيث توقف آخر فحص
        </label>
        <span className="text-[11px] text-zinc-500">
          وصل الفحص إلى:{' '}
          {(['cinemana', 'cee'] as SourceName[])
            .flatMap((src) =>
              (['movie', 'series'] as SourceKind[]).map(
                (k) => `${SOURCE_LABEL[src]} ${KIND_LABEL[k]} صفحة ${reached[`${src}:${k}`] ?? 0}`,
              ),
            )
            .join(' · ')}
        </span>
      </div>
      {checkLines.length > 0 && (
        <div className="rounded-lg bg-black border border-zinc-900 p-3 text-xs leading-6 max-h-72 overflow-auto">
          {checkLines.map((l, i) => (
            <div key={i} className={l.warn ? 'text-amber-400' : 'text-emerald-400'}>
              {l.text}
            </div>
          ))}
          {checking && <Loader2 size={12} className="animate-spin text-sky-400" />}
        </div>
      )}
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
              key={`${i.source ?? 'cinemana'}:${i.kind}:${i.nb}`}
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
              <span className="text-zinc-600">
                {SOURCE_LABEL[i.source ?? 'cinemana']} #{i.nb}
              </span>
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
