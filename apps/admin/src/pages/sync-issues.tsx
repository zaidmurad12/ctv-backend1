import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type { SyncIssueDto } from '../lib/types';

function formatOffset(offsetMs: number): string {
  const seconds = (offsetMs / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${offsetMs > 0 ? '+' : ''}${seconds} ث`;
}

// Lists titles the app's own audio-sync feature has reported a real subtitle mismatch for (see
// SyncIssue in schema.prisma) - an admin fixes the underlying subtitle here (upload the correct
// file, or use the movie/show page's own "مطابقة عبر بصمة الملف" button) once, instead of every
// viewer silently working around it locally.
export default function SyncIssuesPage() {
  const { isLoading, user } = useAuth();
  const [showResolved, setShowResolved] = useState(false);
  const [issues, setIssues] = useState<SyncIssueDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminService
      .listSyncIssues(showResolved)
      .then(setIssues)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل القائمة.'));
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, showResolved]);

  async function toggleResolved(issue: SyncIssueDto) {
    setBusyId(issue.id);
    try {
      await adminService.resolveSyncIssue(issue.id, !issue.resolved);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث الحالة.');
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">مشاكل المزامنة</h1>
      <p className="text-sm text-zinc-500 mb-6">
        أعمال أبلغ عنها التطبيق تلقائياً بأن توقيت ترجمتها الحالية لا يطابق الصوت فعلياً - عالجها
        برفع ملف ترجمة صحيح أو المطابقة عبر بصمة الملف من صفحة العمل نفسه.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setShowResolved(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            !showResolved ? 'bg-white text-black' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          غير معالَجة
        </button>
        <button
          type="button"
          onClick={() => setShowResolved(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            showResolved ? 'bg-white text-black' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          معالَجة
        </button>
      </div>

      {error && <p className="text-sm text-amber-400 mb-4">{error}</p>}

      {issues === null ? null : issues.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500 text-sm">
          {showResolved
            ? 'لا توجد مشاكل معالَجة بعد.'
            : 'لا توجد مشاكل مزامنة مُبلَّغ عنها حالياً.'}
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden">
          {issues.map((issue, i) => (
            <div
              key={issue.id}
              className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={issue.movieId ? `/movies/${issue.movieId}` : `/shows/${issue.showId ?? ''}`}
                  className="font-bold hover:underline"
                >
                  {issue.title}
                </Link>
                <div className="text-xs text-zinc-500 mt-0.5">
                  الإزاحة {formatOffset(issue.offsetMs)}
                  {issue.speed !== 1 && ` · السرعة ${(issue.speed * 100).toFixed(1)}%`}
                  {' · '}أُبلغ عنها {issue.reportCount} {issue.reportCount === 1 ? 'مرة' : 'مرات'}
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === issue.id}
                onClick={() => void toggleResolved(issue)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                  issue.resolved
                    ? 'text-zinc-300 border border-zinc-800 hover:bg-zinc-900'
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {issue.resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                {issue.resolved ? 'إعادة فتح' : 'وسم كمعالَجة'}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={load}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-white transition-colors"
      >
        <RefreshCw size={12} />
        تحديث القائمة
      </button>
    </AdminLayout>
  );
}
