import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Laptop, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService, type JobsOverview } from '../services/adminService';

// The import jobs run on the administrator's own computer, never on a server: a small program there
// (D:\ctv\local-jobs\server.mjs, started with start-job-server.cmd) listens on 127.0.0.1 and this page
// talks to it. When the dashboard is opened from that program the address is relative; from the hosted
// copy it is the computer's own loopback address.
type JobName = 'episodes' | 'newest' | 'all';

interface HelperStatus {
  running: boolean;
  job: JobName | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  lines: string[];
}

const JOBS: Array<{ job: JobName; title: string; text: string }> = [
  {
    job: 'episodes',
    title: 'تحديث الحلقات والمواسم',
    text: 'يضيف الحلقات والمواسم الجديدة، ويكمل صور الحلقات وأسماءها وأوصافها ومددها الناقصة للأعمال الحديثة. حتى نحو 50 دقيقة.',
  },
  {
    job: 'newest',
    title: 'استيراد الأعمال الحديثة',
    text: 'يضيف الأفلام والمسلسلات التي صدرت مؤخراً. حتى نحو 15 دقيقة.',
  },
  {
    job: 'all',
    title: 'الاثنان معاً',
    text: 'يشغّل تحديث الحلقات ثم استيراد الأعمال الحديثة، واحداً بعد الآخر.',
  },
];

const JOB_LABEL: Record<string, string> = {
  episodes: 'تحديث الحلقات والمواسم',
  newest: 'استيراد الأعمال الحديثة',
  all: 'الحلقات ثم الأعمال الحديثة',
};

function helperBase(): string {
  if (typeof window === 'undefined') return '';
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? ''
    : 'http://127.0.0.1:8787';
}

export default function JobsPage() {
  const { isLoading, user } = useAuth();
  const [overview, setOverview] = useState<JobsOverview | null>(null);
  const [helper, setHelper] = useState<'checking' | 'offline' | 'online'>('checking');
  const [status, setStatus] = useState<HelperStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const wasRunning = useRef(false);

  const loadOverview = useCallback(() => {
    adminService
      .jobsOverview()
      .then(setOverview)
      .catch(() => undefined);
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`${helperBase()}/__jobs/status`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      setStatus((await response.json()) as HelperStatus);
      setHelper('online');
    } catch {
      setHelper('offline');
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadOverview();
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => clearInterval(timer);
  }, [user, loadOverview, poll]);

  useEffect(() => {
    if (wasRunning.current && status && !status.running) loadOverview();
    wasRunning.current = !!status?.running;
  }, [status, loadOverview]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [status?.lines.length]);

  async function send(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${helperBase()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as HelperStatus & { error?: string };
      if (!response.ok)
        throw new Error(
          data.error === 'a job is already running'
            ? 'توجد مهمة تعمل الآن.'
            : data.error || 'تعذّر تنفيذ الطلب.',
        );
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الاتصال ببرنامج الحاسوب.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !user) return null;
  const size = overview?.database.sizeMb ?? null;
  const limit = overview?.database.limitMb ?? 1024;
  const pct = size ? Math.min(100, Math.round((size / limit) * 100)) : 0;
  const running = !!status?.running;
  const finished = status && !status.running && status.finishedAt;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5" dir="rtl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black text-white">مهام الاستيراد</h1>
            <p className="text-xs text-zinc-400 mt-1">
              تعمل المهام على حاسوبك أنت وليس على أي خادم.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadOverview();
              void poll();
            }}
            className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
          >
            <RefreshCw size={14} />
            تحديث
          </button>
        </div>

        {helper === 'offline' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300 leading-7">
            <div className="flex items-center gap-2 font-bold mb-1">
              <Laptop size={14} />
              برنامج التشغيل على حاسوبك غير شغّال
            </div>
            افتح المجلد <span dir="ltr">D:\ctv\local-jobs</span> وانقر مرتين على{' '}
            <span dir="ltr">start-job-server.cmd</span>. يفتح لك اللوحة نفسها وتُفعَّل الأزرار. وإن
            فتحت هذه الصفحة من رابط الإنترنت وسألك المتصفح السماح بالاتصال بالشبكة المحلية فاضغط
            سماح. ويجب أن تفتح الصفحة من الحاسوب نفسه (الهاتف لا يصلح).
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="rounded-xl border border-zinc-800 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-zinc-300">
              حجم قاعدة البيانات: <b className="text-white">{size ?? '—'}</b> ميغابايت من {limit}
            </span>
            <span className={pct >= 80 ? 'text-red-400 text-xs' : 'text-zinc-500 text-xs'}>
              {pct >= 80
                ? 'اقتربت من الحد: تتوقف المهام تلقائياً قبل الامتلاء.'
                : 'تتوقف المهام تلقائياً عند 850 ميغابايت لحماية القاعدة المجانية.'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className={`h-full transition-all ${pct >= 80 ? 'bg-red-400' : 'bg-white'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {JOBS.map((item) => (
            <div
              key={item.job}
              className="rounded-xl border border-zinc-800 p-4 flex flex-col gap-3"
            >
              <div>
                <h2 className="text-sm font-black text-white">{item.title}</h2>
                <p className="text-xs text-zinc-400 mt-2 leading-6">{item.text}</p>
              </div>
              <button
                type="button"
                disabled={busy || running || helper !== 'online'}
                onClick={() => void send('/__jobs/run', { job: item.job })}
                className="mt-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-black bg-white hover:bg-zinc-200 disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                تشغيل الآن
              </button>
            </div>
          ))}
        </div>

        {status && (running || finished) && (
          <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              {running ? (
                <Loader2 size={16} className="animate-spin text-sky-400" />
              ) : status.exitCode === 0 ? (
                <CircleCheck size={16} className="text-emerald-400" />
              ) : (
                <CircleX size={16} className="text-red-400" />
              )}
              <span className="text-white font-bold">
                {JOB_LABEL[status.job ?? ''] ?? status.job}
              </span>
              <span className="text-zinc-400 text-xs">
                {running
                  ? 'يعمل الآن على حاسوبك — لا تغلق نافذة البرنامج'
                  : status.exitCode === 0
                    ? 'انتهى بنجاح'
                    : 'توقف أو فشل (انظر السجل)'}
              </span>
              {running && (
                <button
                  type="button"
                  onClick={() => void send('/__jobs/stop')}
                  className="mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10"
                >
                  <Square size={12} />
                  إيقاف
                </button>
              )}
            </div>
            <pre
              ref={logRef}
              dir="ltr"
              className="max-h-72 overflow-auto rounded-lg bg-black border border-zinc-900 p-3 text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap text-left"
            >
              {status.lines.join('\n')}
            </pre>
          </div>
        )}

        <p className="text-xs text-zinc-500 leading-6">
          الأعمال القديمة لا تُستورد بالجملة: يدخل العمل القديم الكتالوج فقط حين يبلّغ تلفاز عن
          ظهوره في قائمة المضاف حديثاً في أحد المصادر.
        </p>
      </div>
    </AdminLayout>
  );
}
