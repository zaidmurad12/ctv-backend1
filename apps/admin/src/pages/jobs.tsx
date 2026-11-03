import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleX, Loader2, Play, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService, type JobName, type JobsOverview } from '../services/adminService';

const JOBS: Array<{ job: JobName; title: string; text: string; auto: boolean }> = [
  {
    job: 'newest',
    title: 'استيراد الأعمال الحديثة',
    text: 'يضيف الأفلام والمسلسلات التي صدرت مؤخراً. يعمل تلقائياً كل يوم، ويمكن تشغيله الآن.',
    auto: true,
  },
  {
    job: 'episodes',
    title: 'تحديث الحلقات والمواسم',
    text: 'يضيف الحلقات الجديدة ويكمل صور الحلقات وأسماءها وأوصافها ومددها الناقصة (للأعمال الحديثة). يدوي فقط.',
    auto: false,
  },
  {
    job: 'old-titles',
    title: 'استيراد الأعمال القديمة والشائعة',
    text: 'يستورد دفعة من الأعمال الشائعة من TMDB. يدوي فقط، ويتوقف تلقائياً قرب امتلاء قاعدة البيانات.',
    auto: false,
  },
];

const STATUS_LABEL: Record<string, string> = {
  queued: 'في الانتظار',
  in_progress: 'يعمل الآن',
  waiting: 'في الانتظار',
  completed: 'انتهى',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });
}

export default function JobsPage() {
  const { isLoading, user } = useAuth();
  const [data, setData] = useState<JobsOverview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<JobName | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminService
      .jobsOverview()
      .then((overview) => {
        setData(overview);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذّر تحميل المهام.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const running = !!data?.runs.some((run) => run.status !== 'completed');

  // While a job is running the page refreshes itself, which also keeps the free host awake.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function start(job: JobName) {
    setBusy(job);
    setNotice('');
    setError('');
    try {
      await adminService.runJob(job);
      setNotice('بدأت المهمة. تظهر في الجدول بعد لحظات وتستغرق من 15 إلى 40 دقيقة.');
      setTimeout(load, 4000);
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

  return (
    <AdminLayout>
      <div className="p-6 space-y-5" dir="rtl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black text-white">مهام الاستيراد</h1>
            <p className="text-xs text-zinc-400 mt-1">
              تعمل المهام على خوادم GitHub المجانية وليس على الخادم نفسه. مهمة واحدة فقط في كل مرة.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-zinc-800 text-zinc-300 hover:bg-zinc-900"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            تحديث
          </button>
        </div>

        {data && !data.configured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300 leading-6">
            تشغيل المهام من هنا غير مفعّل بعد: أضف المتغير GITHUB_DISPATCH_TOKEN في إعدادات الخادم
            على Render (مفتاح GitHub يملك صلاحية Actions على المستودع). المهمة اليومية التلقائية
            تعمل بدونه.
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}

        <div className="rounded-xl border border-zinc-800 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-zinc-300">
              حجم قاعدة البيانات: <b className="text-white">{size ?? '—'}</b> ميغابايت من {limit}
            </span>
            <span className={pct >= 90 ? 'text-red-400 text-xs' : 'text-zinc-500 text-xs'}>
              {pct >= 90
                ? 'اقتربت من الحد: تتوقف مهام الاستيراد تلقائياً قبل الامتلاء.'
                : 'عند بلوغ 920 ميغابايت تتوقف مهام الاستيراد تلقائياً لحماية القاعدة.'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
            <div
              className={`h-full transition-all ${pct >= 90 ? 'bg-red-400' : 'bg-white'}`}
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
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-white">{item.title}</h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      item.auto
                        ? 'text-emerald-400 border-emerald-500/30'
                        : 'text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {item.auto ? 'تلقائي يومياً' : 'يدوي'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-2 leading-6">{item.text}</p>
              </div>
              <button
                type="button"
                disabled={busy !== null || running || !data?.configured}
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

        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-900">
          <div className="px-4 py-2 text-xs font-bold text-zinc-300">آخر التشغيلات</div>
          {(data?.runs ?? []).length === 0 && (
            <p className="p-4 text-xs text-zinc-500">لا توجد تشغيلات بعد.</p>
          )}
          {(data?.runs ?? []).map((run) => (
            <a
              key={run.id}
              href={run.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-zinc-900"
            >
              {run.status !== 'completed' ? (
                <Loader2 size={14} className="animate-spin text-sky-400 shrink-0" />
              ) : run.conclusion === 'success' ? (
                <CircleCheck size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <CircleX size={14} className="text-red-400 shrink-0" />
              )}
              <span className="text-white font-semibold">{run.title}</span>
              <span className="text-zinc-500">
                {run.trigger === 'schedule' ? 'تلقائي' : 'يدوي'}
              </span>
              <span className="mr-auto text-zinc-400">
                {run.status === 'completed'
                  ? run.conclusion === 'success'
                    ? 'نجح'
                    : 'فشل أو أُوقف'
                  : (STATUS_LABEL[run.status] ?? run.status)}
              </span>
              <span className="text-zinc-600" dir="ltr">
                {formatTime(run.startedAt)}
              </span>
            </a>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
