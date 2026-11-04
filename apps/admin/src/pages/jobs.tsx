import { useCallback, useEffect, useState } from 'react';
import { Laptop, Loader2, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService, type JobsOverview } from '../services/adminService';

// The import jobs run on the administrator's own computer (D:\ctv\local-jobs), not on any server,
// so this page only explains them and shows how full the free database is.
const LOCAL_JOBS = [
  {
    file: 'run-episodes.cmd',
    title: 'تحديث الحلقات والمواسم',
    text: 'يضيف الحلقات والمواسم الجديدة، ويكمل صور الحلقات وأسماءها وأوصافها ومددها الناقصة للأعمال الحديثة.',
  },
  {
    file: 'run-newest.cmd',
    title: 'استيراد الأعمال الحديثة',
    text: 'يضيف الأفلام والمسلسلات التي صدرت مؤخراً.',
  },
  {
    file: 'run-all.cmd',
    title: 'الاثنان معاً',
    text: 'يشغّل تحديث الحلقات ثم استيراد الأعمال الحديثة، واحداً بعد الآخر.',
  },
];

export default function JobsPage() {
  const { isLoading, user } = useAuth();
  const [data, setData] = useState<JobsOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminService
      .jobsOverview()
      .then((overview) => {
        setData(overview);
        setError('');
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'تعذّر تحميل البيانات.'),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

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
              تعمل هذه المهام من حاسوبك أنت، وليس من أي خادم. شغّلها بنقرتين من مجلد المهام على
              الحاسوب.
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

        <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Laptop size={16} className="text-white" />
            <h2 className="text-sm font-black text-white">التشغيل من الحاسوب</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-6">
            افتح المجلد{' '}
            <span dir="ltr" className="text-zinc-200">
              D:\ctv\local-jobs
            </span>{' '}
            وانقر مرتين على الملف المطلوب. تظهر نافذة تُريك التقدم وتُغلق بعد الانتهاء، ويُحفظ سجل
            كل تشغيل في المجلد logs.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {LOCAL_JOBS.map((job) => (
              <div key={job.file} className="rounded-lg border border-zinc-900 p-3 space-y-2">
                <h3 className="text-sm font-bold text-white">{job.title}</h3>
                <p className="text-xs text-zinc-400 leading-6">{job.text}</p>
                <span
                  dir="ltr"
                  className="inline-block text-[11px] px-2 py-1 rounded bg-zinc-900 text-zinc-300"
                >
                  {job.file}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-zinc-500 leading-6">
          الأعمال القديمة لا تُستورد بالجملة: يدخل العمل القديم الكتالوج فقط حين يبلّغ تلفاز عن
          ظهوره في قائمة المضاف حديثاً في أحد المصادر.
        </p>
      </div>
    </AdminLayout>
  );
}
