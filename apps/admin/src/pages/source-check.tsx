import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Loader2, Play, Square } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import { checkTitle, type CheckResult, type CheckTitle } from '../lib/sourceMatch';
import { TvSyncLog } from '../components/TvSyncLog';

type Scope = 'unchecked' | 'unmatched' | 'all';
type Kind = 'movie' | 'show' | 'both';

const CONCURRENCY = 3;
const PAGE = 500;
const SAVE_EVERY = 20;

interface Row {
  title: CheckTitle;
  result: CheckResult;
}

// Runs the source-compatibility check from this browser (the sources only answer requests from
// inside Iraq - see lib/sourceMatch.ts) and saves each result as the title's compatible / not
// compatible mark, which the movie and series lists can then be filtered by.
export default function SourceCheckPage() {
  const { isLoading, user } = useAuth();
  const [scope, setScope] = useState<Scope>('unchecked');
  const [kind, setKind] = useState<Kind>('both');
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [matched, setMatched] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [published, setPublished] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [showOnly, setShowOnly] = useState<'all' | 'unmatched'>('unmatched');
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => () => {
    stopRef.current = true;
  }, []);

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setError(null);
    setDone(0);
    setMatched(0);
    setUnmatched(0);
    setPublished(0);
    setRows([]);
    const pending: Array<{ type: 'movie' | 'show'; id: string; match: boolean }> = [];
    const flush = async () => {
      if (!pending.length) return;
      const batch = pending.splice(0, pending.length);
      try {
        const saved = await adminService.saveSourceCheckResults(batch);
        const newlyPublished = saved.published ?? 0;
        if (newlyPublished) setPublished((n) => n + newlyPublished);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر حفظ بعض النتائج.');
      }
    };
    try {
      const kinds: Array<'movie' | 'show'> = kind === 'both' ? ['movie', 'show'] : [kind];
      // The whole list is taken first, then checked: the "unchecked"/"unmatched" sets change as
      // results are saved, so paging through them while checking would skip or repeat titles.
      const queue: CheckTitle[] = [];
      for (const k of kinds) {
        for (let offset = 0; ; offset += PAGE) {
          const page = await adminService.sourceCheckCandidates(scope, k, offset, PAGE);
          queue.push(...page.items);
          if (page.items.length < PAGE) break;
        }
      }
      setTotal(queue.length);
      let index = 0;
      const worker = async () => {
        while (index < queue.length && !stopRef.current) {
          const title = queue[index++];
          const result = await checkTitle(title).catch(() => ({ match: false }) as CheckResult);
          pending.push({ type: title.type, id: title.id, match: result.match });
          setDone((n) => n + 1);
          if (result.match) setMatched((n) => n + 1);
          else setUnmatched((n) => n + 1);
          setRows((list) => [{ title, result }, ...list].slice(0, 400));
          if (pending.length >= SAVE_EVERY) await flush();
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الفحص.');
    } finally {
      await flush();
      setRunning(false);
    }
  }

  if (isLoading || !user) return null;
  const visible = showOnly === 'unmatched' ? rows.filter((r) => !r.result.match) : rows;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5" dir="rtl">
        <div>
          <h1 className="text-xl font-black text-white">فحص التوافق مع المصادر</h1>
          <p className="text-xs text-zinc-400 mt-1">
            يبحث عن كل عمل في سينمانا و CEE من متصفحك (المصادر تعمل من داخل العراق فقط) ويحفظ النتيجة كعلامة متوافق / غير
            متوافق، يمكن بعدها فلترة قوائم الأفلام والمسلسلات بها. العمل يُعد متوافقاً فقط إذا وُجد وله فيديو فعلاً.
          </p>
        </div>

        <TvSyncLog />

        <h2 className="text-sm font-black text-white pt-2">فحص يدوي من المتصفح</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={scope}
            disabled={running}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
          >
            <option value="unchecked">الأعمال التي لم تُفحص بعد</option>
            <option value="unmatched">إعادة فحص غير المتوافقة</option>
            <option value="all">كل الأعمال</option>
          </select>
          <select
            value={kind}
            disabled={running}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-black border border-zinc-800 text-white"
          >
            <option value="both">الأفلام والمسلسلات</option>
            <option value="movie">الأفلام فقط</option>
            <option value="show">المسلسلات فقط</option>
          </select>
          {running ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10"
            >
              <Square size={12} />
              إيقاف
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-black bg-white hover:bg-zinc-200"
            >
              <Play size={12} />
              بدء الفحص
            </button>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="text-zinc-300">
              تم فحص: <b className="text-white">{done}</b> من {total}
            </span>
            <span className="text-emerald-400">
              متوافق: <b>{matched}</b>
            </span>
            <span className="text-red-400">
              غير متوافق: <b>{unmatched}</b>
            </span>
            {published > 0 && (
              <span className="text-sky-400">
                مسودات نُشرت: <b>{published}</b>
              </span>
            )}
            {running && (
              <span className="flex items-center gap-1 text-zinc-400">
                <Loader2 size={14} className="animate-spin" /> جارٍ الفحص...
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div className="h-full bg-white transition-all" style={{ width: `${percent}%` }} />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowOnly('unmatched')}
            className={`px-3 py-1.5 rounded-lg border ${showOnly === 'unmatched' ? 'bg-white text-black border-white' : 'border-zinc-800 text-zinc-300'}`}
          >
            غير المتوافقة فقط
          </button>
          <button
            type="button"
            onClick={() => setShowOnly('all')}
            className={`px-3 py-1.5 rounded-lg border ${showOnly === 'all' ? 'bg-white text-black border-white' : 'border-zinc-800 text-zinc-300'}`}
          >
            كل النتائج
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-900">
          {visible.length === 0 && <p className="p-4 text-xs text-zinc-500">لا توجد نتائج بعد.</p>}
          {visible.map(({ title, result }) => (
            <a
              key={`${title.type}:${title.id}`}
              href={title.type === 'movie' ? `/movies/${title.id}` : `/shows/${title.id}`}
              className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-zinc-900"
            >
              {result.match ? <CircleCheck size={14} className="text-emerald-400 shrink-0" /> : <CircleX size={14} className="text-red-400 shrink-0" />}
              <span className="text-white font-semibold">{title.titleAr || title.title}</span>
              <span className="text-zinc-500">{title.title}</span>
              <span className="text-zinc-600">{title.year ?? ''}</span>
              <span className="text-zinc-600">{title.type === 'movie' ? 'فيلم' : 'مسلسل'}</span>
              <span className="mr-auto text-zinc-400">
                {title.status === 'DRAFT' ? (result.match ? '(كان مسودة — نُشر) ' : '(مسودة) ') : ''}
                {result.match
                  ? result.source === 'link'
                    ? 'له رابط تشغيل'
                    : `${result.source === 'cee' ? 'CEE' : 'سينمانا'} #${result.nb}${result.sourceTitle ? ` — ${result.sourceTitle}` : ''}`
                  : result.emptyEntry
                    ? 'موجود في المصدر لكن بلا فيديو'
                    : 'لم يُعثر عليه'}
              </span>
            </a>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
