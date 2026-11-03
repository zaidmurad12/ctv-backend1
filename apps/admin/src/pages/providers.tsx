import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, RefreshCw, Search } from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type { ProviderHealthSummaryDto, ProviderSummaryDto } from '../lib/types';

export default function ProvidersPage() {
  const { isLoading, user } = useAuth();
  const [providers, setProviders] = useState<ProviderSummaryDto[]>([]);
  const [health, setHealth] = useState<Record<string, ProviderHealthSummaryDto>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminService
      .listProviders()
      .then(setProviders)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل المزوّدين.'));
    adminService
      .checkProvidersHealth()
      .then((results) => setHealth(Object.fromEntries(results.map((h) => [h.providerId, h]))))
      .catch(() => {
        // Health is a nice-to-have overlay on the list above - a failed check shouldn't block
        // the page from showing the providers themselves.
      });
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function toggle(p: ProviderSummaryDto) {
    setBusyId(p.id);
    try {
      await adminService.setProviderEnabled(p.id, !p.isEnabled);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث حالة المزوّد.');
    } finally {
      setBusyId(null);
    }
  }

  async function discover(p: ProviderSummaryDto) {
    setBusyId(p.id);
    try {
      const result = await adminService.triggerDiscovery(p.id);
      setError(`تم اكتشاف ${result.discovered} عنصرًا جديدًا من ${p.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تشغيل الاكتشاف.');
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <h1 className="text-2xl font-black mb-1">مزوّدو المحتوى</h1>
      <p className="text-sm text-zinc-500 mb-8">تفعيل/تعطيل مصادر الاستيراد وتشغيل اكتشاف يدوي.</p>

      {error && <p className="text-sm text-amber-400 mb-4">{error}</p>}

      {providers.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500 text-sm">
          لا يوجد أي مزوّد محتوى مسجّل بعد.
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl overflow-hidden">
          {providers.map((p, i) => {
            const h = health[p.id];
            return (
              <div
                key={p.id}
                className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
              >
                <div className="flex-1">
                  <div className="font-bold flex items-center gap-2">
                    {p.name}
                    {h &&
                      (h.status === 'UP' || h.status === 'ok' ? (
                        <CircleCheck size={14} className="text-emerald-400" />
                      ) : (
                        <CircleX size={14} className="text-red-400" />
                      ))}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    أولوية {p.priority} · {p.capabilities.join('، ') || 'بدون قدرات معلنة'}
                    {h && ` · ${h.latencyMs}ms`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void discover(p)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors disabled:opacity-50"
                >
                  <Search size={13} />
                  اكتشاف
                </button>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void toggle(p)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                    p.isEnabled
                      ? 'bg-white text-black hover:bg-zinc-200'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {p.isEnabled ? 'مفعّل' : 'معطّل'}
                </button>
              </div>
            );
          })}
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
