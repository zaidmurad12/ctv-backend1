import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Play, Search, Square } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import {
  adminService,
  type SourceImportResult,
  type SourceImportState,
} from '../services/adminService';
import {
  catalogPage,
  displayTitle,
  isArabic,
  searchSource,
  SOURCE_LABEL,
  type SourceKind,
  type SourceName,
  type SourceTitle,
} from '../lib/sourceCatalog';

// Finds titles the sources have and the app doesn't, and brings them in. The sources only answer
// from inside Iraq, so this page reads them from this browser and sends what it finds to the server,
// which publishes titles already in the catalog and imports missing ones from TMDB (any age).
const IMPORT_BATCH = 3;

const STATE_LABEL: Record<SourceImportState, string> = {
  published: 'موجود في التطبيق',
  hidden: 'موجود لكن غير ظاهر',
  missing: 'غير موجود',
  activated: 'نُشر الآن',
  imported: 'استُورد الآن',
  'no-match': 'لم يُعثر عليه في TMDB',
  'db-full': 'القاعدة ممتلئة',
  error: 'خطأ',
};
const STATE_COLOR: Record<SourceImportState, string> = {
  published: 'text-zinc-500',
  hidden: 'text-amber-400',
  missing: 'text-sky-400',
  activated: 'text-emerald-400',
  imported: 'text-emerald-400',
  'no-match': 'text-zinc-500',
  'db-full': 'text-red-400',
  error: 'text-red-400',
};

const keyOf = (t: { source: string; nb: string }) => `${t.source}:${t.nb}`;
const needsImport = (state?: SourceImportState) => state === 'missing' || state === 'hidden';

const inputCls =
  'bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600';
const btnCls =
  'flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-black bg-white hover:bg-zinc-200 disabled:opacity-40';

export default function SourceImportPage() {
  const { isLoading, user } = useAuth();
  const [tab, setTab] = useState<'search' | 'browse'>('search');
  const [dbSizeMb, setDbSizeMb] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    adminService
      .jobsOverview()
      .then((o) => setDbSizeMb(o.database.sizeMb))
      .catch(() => undefined);
  }, [user]);

  if (isLoading || !user) return null;
  return (
    <AdminLayout>
      <div className="p-6 space-y-5" dir="rtl">
        <div>
          <h1 className="text-xl font-black text-white">استيراد من المصادر</h1>
          <p className="text-xs text-zinc-400 mt-1 leading-6">
            يبحث في سينمانا وسي من هذا المتصفح (المصادر لا تجيب إلا من داخل العراق)، ويضيف إلى
            التطبيق ما ليس فيه: العمل الموجود في الكتالوج وغير الظاهر يُنشر، وغير الموجود يُستورد من
            TMDB أياً كان عمره، ويُربط بمدخله في المصدر فيعمل مباشرة.
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            حجم قاعدة البيانات: <b className="text-zinc-300">{dbSizeMb ?? '—'}</b> ميغابايت من 1024
            — يتوقف الاستيراد عند 850.
          </p>
        </div>

        <div className="flex gap-2">
          {(
            [
              ['search', 'بحث بالاسم'],
              ['browse', 'تصفّح الكتالوج'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                tab === value
                  ? 'bg-white text-black border-white'
                  : 'text-zinc-300 border-zinc-800 hover:bg-zinc-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'search' ? (
          <SearchPanel onDbSize={setDbSizeMb} />
        ) : (
          <BrowsePanel onDbSize={setDbSizeMb} />
        )}
      </div>
    </AdminLayout>
  );
}

function SearchPanel({ onDbSize }: { onDbSize: (mb: number | null) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SourceKind>('movie');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<SourceTitle[]>([]);
  const [states, setStates] = useState<Record<string, SourceImportResult>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError('');
    setItems([]);
    setStates({});
    try {
      const found = await Promise.allSettled(
        (['cinemana', 'cee'] as SourceName[]).map((s) => searchSource(s, q, kind)),
      );
      const list = found.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      if (found.every((r) => r.status === 'rejected'))
        setError('تعذّر الوصول إلى المصادر - يجب فتح الصفحة من داخل العراق.');
      setItems(list);
      if (list.length) {
        const { results, dbSizeMb } = await adminService.importFromSources(list.slice(0, 24), true);
        onDbSize(dbSizeMb);
        setStates(Object.fromEntries(results.map((r) => [keyOf(r), r])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر البحث.');
    } finally {
      setSearching(false);
    }
  }

  async function importOne(item: SourceTitle) {
    const key = keyOf(item);
    setBusy((b) => new Set(b).add(key));
    try {
      const { results, dbSizeMb } = await adminService.importFromSources([item]);
      onDbSize(dbSizeMb);
      if (results[0]) setStates((s) => ({ ...s, [key]: results[0] }));
    } catch (err) {
      setStates((s) => ({
        ...s,
        [key]: { source: item.source, nb: item.nb, state: 'error', message: String(err) },
      }));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="اسم الفيلم أو المسلسل (عربي أو إنجليزي)"
          className={`${inputCls} min-w-[280px] flex-1`}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SourceKind)}
          className={inputCls}
        >
          <option value="movie">أفلام</option>
          <option value="series">مسلسلات</option>
        </select>
        <button
          type="button"
          className={btnCls}
          disabled={searching || query.trim().length < 2}
          onClick={() => void search()}
        >
          {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          بحث
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!searching && items.length === 0 && query && !error && (
        <p className="text-xs text-zinc-500">لا نتائج بعد - اضغط بحث.</p>
      )}
      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-900">
        {items.map((item) => {
          const key = keyOf(item);
          const result = states[key];
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-2 text-sm">
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.poster} alt="" className="w-9 h-12 object-cover rounded" />
              ) : (
                <div className="w-9 h-12 rounded bg-zinc-900" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-white font-bold truncate">{displayTitle(item)}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {[item.enTitle, item.year, SOURCE_LABEL[item.source], item.ref ? 'IMDb' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {result && (
                <span className={`text-xs ${STATE_COLOR[result.state]}`}>
                  {STATE_LABEL[result.state]}
                </span>
              )}
              {(!result || needsImport(result.state) || result.state === 'error') && (
                <button
                  type="button"
                  className={btnCls}
                  disabled={busy.has(key)}
                  onClick={() => void importOne(item)}
                >
                  {busy.has(key) ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  {result?.state === 'hidden' ? 'نشر' : 'استيراد'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LogLine {
  text: string;
  tone: 'info' | 'ok' | 'warn';
}

type SourceChoice = SourceName | 'both';
type KindChoice = SourceKind | 'both';
type LanguageChoice = 'all' | 'arabic' | 'foreign';

// The last catalog page finished for each source and kind, so a long scan can be stopped and
// continued later from there (kept in this browser only).
const PROGRESS_KEY = 'ctv.sourceImport.progress';
type Progress = Record<string, number>;
function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Progress;
  } catch {
    return {};
  }
}
function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Private window or blocked storage: the scan still works, it just can't resume.
  }
}
const progressKey = (source: SourceName, kind: SourceKind) => `${source}:${kind}`;
const KIND_LABEL: Record<SourceKind, string> = { movie: 'أفلام', series: 'مسلسلات' };

function BrowsePanel({ onDbSize }: { onDbSize: (mb: number | null) => void }) {
  const [source, setSource] = useState<SourceChoice>('both');
  const [kind, setKind] = useState<KindChoice>('both');
  const [language, setLanguage] = useState<LanguageChoice>('all');
  const [resume, setResume] = useState(true);
  const [maxPages, setMaxPages] = useState('');
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({ pages: 0, scanned: 0, present: 0, added: 0, notFound: 0 });
  const [progress, setProgress] = useState<Progress>({});
  const [log, setLog] = useState<LogLine[]>([]);
  const stopRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => setProgress(loadProgress()), []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.length]);
  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const say = (text: string, tone: LogLine['tone'] = 'info') =>
    setLog((l) => [...l.slice(-500), { text, tone }]);

  const sources: SourceName[] = source === 'both' ? ['cinemana', 'cee'] : [source];
  const kinds: SourceKind[] = kind === 'both' ? ['movie', 'series'] : [kind];

  function resetProgress() {
    const next = { ...progress };
    for (const s of sources) for (const k of kinds) delete next[progressKey(s, k)];
    saveProgress(next);
    setProgress(next);
  }

  // One source + kind: page by page from where it stopped last time (or the newest page) to the end
  // of the catalog, the page limit, or Stop. Returns false when the run must end (stop, database full).
  async function scan(src: SourceName, knd: SourceKind, pageBudget: { left: number }) {
    const key = progressKey(src, knd);
    const start = resume ? (loadProgress()[key] ?? 0) : 0;
    say(`${SOURCE_LABEL[src]} - ${KIND_LABEL[knd]}: من الصفحة ${start + 1}`);
    for (let page = start; pageBudget.left > 0 && !stopRef.current; page++) {
      let titles: SourceTitle[];
      try {
        titles = await catalogPage(src, knd, page);
      } catch {
        say(`الصفحة ${page + 1}: تعذّر الوصول إلى المصدر (يجب أن تكون داخل العراق).`, 'warn');
        return false;
      }
      if (titles.length === 0) {
        say(`${SOURCE_LABEL[src]} - ${KIND_LABEL[knd]}: انتهى الكتالوج عند الصفحة ${page}.`, 'ok');
        return true;
      }
      pageBudget.left--;
      const wanted =
        language === 'arabic'
          ? titles.filter(isArabic)
          : language === 'foreign'
            ? titles.filter((t) => !isArabic(t))
            : titles;
      setCounts((c) => ({ ...c, pages: c.pages + 1, scanned: c.scanned + wanted.length }));
      if (wanted.length > 0) {
        const check = await adminService.importFromSources(wanted, true);
        onDbSize(check.dbSizeMb);
        const todo = wanted.filter((t) =>
          needsImport(check.results.find((r) => keyOf(r) === keyOf(t))?.state),
        );
        setCounts((c) => ({ ...c, present: c.present + (wanted.length - todo.length) }));
        if (todo.length)
          say(`الصفحة ${page + 1}: ${todo.length} من ${wanted.length} غير ظاهرة في التطبيق.`);
        for (let i = 0; i < todo.length && !stopRef.current; i += IMPORT_BATCH) {
          const { results, dbSizeMb } = await adminService.importFromSources(
            todo.slice(i, i + IMPORT_BATCH),
          );
          onDbSize(dbSizeMb);
          for (const r of results) {
            const title = todo.find((t) => keyOf(t) === keyOf(r));
            const name = r.title || (title ? displayTitle(title) : r.nb);
            if (r.state === 'imported' || r.state === 'activated') {
              setCounts((c) => ({ ...c, added: c.added + 1 }));
              say(`  + ${name} (${STATE_LABEL[r.state]})`, 'ok');
            } else if (r.state === 'no-match') {
              setCounts((c) => ({ ...c, notFound: c.notFound + 1 }));
              say(`  - ${name}: لم يُعثر عليه في TMDB`, 'warn');
            } else if (r.state === 'db-full') {
              say('قاعدة البيانات بلغت 850 ميغابايت - توقف الاستيراد.', 'warn');
              return false;
            } else if (r.state === 'error') {
              say(`  ! ${name}: ${r.message ?? 'خطأ'}`, 'warn');
            }
          }
        }
      }
      // Only a page finished in full counts - a stop mid-page redoes that page next time.
      if (!stopRef.current) {
        const next = { ...loadProgress(), [key]: page + 1 };
        saveProgress(next);
        setProgress(next);
      }
    }
    return !stopRef.current;
  }

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    setCounts({ pages: 0, scanned: 0, present: 0, added: 0, notFound: 0 });
    const pageBudget = { left: Number(maxPages) > 0 ? Number(maxPages) : Number.POSITIVE_INFINITY };
    try {
      const runs = sources.flatMap((s) => kinds.map((k) => [s, k] as const));
      for (const [s, k] of runs) {
        if (!(await scan(s, k, pageBudget))) break;
        if (pageBudget.left <= 0) {
          say('بلغ عدد الصفحات المحدد.');
          break;
        }
      }
      say(stopRef.current ? 'توقف - يكمل من الصفحة نفسها في المرة القادمة.' : 'انتهى.');
    } catch (err) {
      say(`توقف بسبب خطأ: ${err instanceof Error ? err.message : String(err)}`, 'warn');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceChoice)}
          className={inputCls}
          disabled={running}
        >
          <option value="both">سينمانا وسي</option>
          <option value="cinemana">سينمانا</option>
          <option value="cee">سي</option>
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as KindChoice)}
          className={inputCls}
          disabled={running}
        >
          <option value="both">أفلام ومسلسلات</option>
          <option value="movie">أفلام</option>
          <option value="series">مسلسلات</option>
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageChoice)}
          className={inputCls}
          disabled={running}
        >
          <option value="all">العربية والأجنبية</option>
          <option value="arabic">العربية فقط</option>
          <option value="foreign">الأجنبية فقط</option>
        </select>
        <input
          value={maxPages}
          onChange={(e) => setMaxPages(e.target.value)}
          placeholder="عدد الصفحات (فارغ = حتى النهاية)"
          className={`${inputCls} w-56`}
          disabled={running}
          inputMode="numeric"
        />
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={resume}
            onChange={(e) => setResume(e.target.checked)}
            disabled={running}
          />
          أكمل من حيث توقفت
        </label>
        {running ? (
          <button
            type="button"
            onClick={() => (stopRef.current = true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10"
          >
            <Square size={12} />
            إيقاف
          </button>
        ) : (
          <button type="button" className={btnCls} onClick={() => void run()}>
            <Play size={13} />
            ابدأ
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span>وصل الفحص إلى:</span>
        {(['cinemana', 'cee'] as SourceName[]).flatMap((s) =>
          (['movie', 'series'] as SourceKind[]).map((k) => (
            <span key={progressKey(s, k)}>
              {SOURCE_LABEL[s]} {KIND_LABEL[k]}: صفحة {progress[progressKey(s, k)] ?? 0}
            </span>
          )),
        )}
        {!running && (
          <button type="button" onClick={resetProgress} className="underline hover:text-zinc-300">
            ابدأ من جديد للاختيار الحالي
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 leading-5">
        يمر على الكتالوج من الأحدث إلى الأقدم، 24 عملاً في كل صفحة، ويضيف ما ليس في التطبيق. يمكنك
        الإيقاف في أي وقت والمتابعة لاحقاً من الصفحة نفسها. أبقِ الصفحة مفتوحة أثناء العمل.
        «العربية» تقريبية: ما عنوانه عربي ولا عنوان إنجليزياً له.
      </p>
      <div className="flex flex-wrap gap-4 text-xs text-zinc-300">
        <span>
          صفحات: <b className="text-white">{counts.pages}</b>
        </span>
        <span>
          فُحص: <b className="text-white">{counts.scanned}</b>
        </span>
        <span>
          موجود أصلاً: <b className="text-white">{counts.present}</b>
        </span>
        <span>
          أُضيف: <b className="text-emerald-400">{counts.added}</b>
        </span>
        <span>
          لم يُعثر عليه: <b className="text-zinc-400">{counts.notFound}</b>
        </span>
        {running && <Loader2 size={14} className="animate-spin text-sky-400" />}
      </div>
      <div
        ref={logRef}
        className="max-h-96 overflow-auto rounded-lg bg-black border border-zinc-900 p-3 text-xs leading-6"
      >
        {log.length === 0 && <p className="text-zinc-600">السجل يظهر هنا.</p>}
        {log.map((line, i) => (
          <div
            key={i}
            className={
              line.tone === 'ok'
                ? 'text-emerald-400'
                : line.tone === 'warn'
                  ? 'text-amber-400'
                  : 'text-zinc-300'
            }
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
