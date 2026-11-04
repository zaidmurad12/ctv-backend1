import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Loader2, Play, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService, type JobName, type JobsOverview } from '../services/adminService';

// The jobs run on the server in small batches (the free host has little memory), so a job takes
// a few minutes; press it again for another batch. While one runs the page polls, which also keeps
// the free host awake.
const JOBS: Array<{ job: JobName; title: string; text: string }> = [
  {
    job: 'episodes',
    title: 'تحديث الحلقات والمواسم',
    text: 'يضيف الحلقات والمواسم الجديدة ويكمل صور الحلقات وأسماءها وأوصافها ومددها الناقصة. دفعة من نحو 12 دقيقة، كرّر الضغط لدفعة أخرى.',
  },
  {
    job: 'newest',
    title: 'استيراد الأعمال الحديثة',
    text: 'يضيف الأفلام والمسلسلات التي صدرت مؤخراً. دفعة من نحو 10 دقائق.',
  },
];

const JOB_LABEL: Record<string, string> = {
  episodes: 'تحديث الحلقات والمواسم',
  newest: 'استيراد الأعمال الحديثة',
};

export default function JobsPage() {
  const { isLoading, user } = useAuth();
  const [data, setData] = useState<JobsOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<JobName | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const load = useCallback(() => {
    adminService
      .jobsOverview()
      .then((overview) => {
        setData(overview);
        setError('');
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذّر تحميل المهام.'),
      );
  }, []);

  const running = !!data?.current?.running;

  useEffect(() => {
    if (!user) return;
    load();
    const timer = setInterval(load, running ? 5000 : 30000);
    return () => clearInterval(timer);
  }, [user, running, load]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [data?.current?.lines.length]);

  async function start(job: JobName) {
    setBusy(job);
    setError('');
    try {
      await adminService.runJob(job);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء المهمة.');
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !user) return null;
  const size = data?.database.sizeMb ?? null;
  const limit = data?.database.limitMb ?? 1024;
  const pct = size ? Math.min(100, Math.round((size / limit) * 100)) : 0;
  const current = data?.current ?? null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5" dir="rtl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black text-white">مهام الاستيراد</h1>
            <p className="text-xs text-zinc-400 mt-1">
              تعمل على الخادم. مهمة واحدة في كل مرة، ويُفضَّل إبقاء هذه الصفحة مفتوحة أثناء العمل.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
          >
            <RefreshCw size={14} />
            تحديث
          </button>
        </div>

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

        <div className="grid gap-3 md:grid-cols-2">
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
                disabled={busy !== null || running}
                onClick={() => void start(item.job)}
                className="mt-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-black bg-white hover:bg-zinc-200 disabled:opacity-40"
              >
                {busy === item.job ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                تشغيل الآن
              </button>
            </div>
          ))}
        </div>

        {current && (
          <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              {current.running ? (
                <Loader2 size={16} className="animate-spin text-sky-400" />
              ) : current.ok ? (
                <CircleCheck size={16} className="text-emerald-400" />
              ) : (
                <CircleX size={16} className="text-red-400" />
              )}
              <span className="text-white font-bold">{JOB_LABEL[current.job] ?? current.job}</span>
              <span className="text-zinc-400 text-xs">
                {current.running ? 'يعمل الآن' : current.ok ? 'انتهى بنجاح' : 'توقف أو فشل'}
              </span>
            </div>
            <pre
              ref={logRef}
              dir="ltr"
              className="max-h-72 overflow-auto rounded-lg bg-black border border-zinc-900 p-3 text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap text-left"
            >
              {current.lines.join('\n')}
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
