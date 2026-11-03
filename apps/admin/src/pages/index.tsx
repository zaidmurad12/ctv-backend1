import { useEffect, useState } from 'react';
import { Clapperboard, Film, Tv, Users } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type { DashboardStatisticsDto } from '../lib/types';

function StatCard({ label, value, Icon }: { label: string; value: number; Icon: typeof Film }) {
  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-white text-black flex items-center justify-center shrink-0">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-black">{value.toLocaleString('ar')}</div>
        <div className="text-sm text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isLoading, user } = useAuth();
  const [stats, setStats] = useState<DashboardStatisticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    adminService
      .getStatistics()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذّر تحميل الإحصائيات.');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">لوحة القيادة</h1>
      <p className="text-sm text-zinc-500 mb-8">نظرة عامة على حالة المنصة.</p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="الأفلام" value={stats.movies} Icon={Film} />
          <StatCard label="المسلسلات" value={stats.shows} Icon={Tv} />
          <StatCard label="الحلقات" value={stats.episodes} Icon={Clapperboard} />
          <StatCard label="المستخدمون" value={stats.users} Icon={Users} />
        </div>
      )}
    </AdminLayout>
  );
}
