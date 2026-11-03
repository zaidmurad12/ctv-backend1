import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { adminService } from '../services/adminService';
import type { AdminShowDetailDto } from '../lib/types';

// The sources send CORS "*" (verified), so this test runs straight from the admin's own browser -
// the backend can't do it, Cloud Run is blocked from both sources.
const SOURCES = [
  { key: 'cee', label: 'CEE', base: 'https://cee.buzz/api/android' },
  { key: 'cinemana', label: 'سينمانا', base: 'https://cinemana.shabakaty.com/api/android' },
] as const;

interface SourceHit {
  source: string;
  base: string;
  nb: string;
  title: string;
  year: string;
}
interface SourceLayout {
  source: string;
  nb: string;
  title: string;
  counts: number[];
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(await response.text());
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function parseLayout(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((part) => Number(part));
}

export function SeasonCompatibilityPanel({
  show,
  onChanged,
}: {
  show: AdminShowDetailDto;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState(show.title);
  const [hits, setHits] = useState<SourceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<SourceLayout[]>([]);
  const currentCounts = show.seasons
    .filter((s) => s.seasonNumber >= 1)
    .map((s) => s.episodes.length);
  const [layoutText, setLayoutText] = useState(currentCounts.join(', '));
  const [allowDelete, setAllowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const layout = parseLayout(layoutText);
  const layoutValid = layout.length > 0 && layout.every((n) => Number.isInteger(n) && n >= 1);
  const layoutTotal = layoutValid ? layout.reduce((a, b) => a + b, 0) : 0;
  const currentTotal = currentCounts.reduce((a, b) => a + b, 0);

  async function mark(value: boolean | null) {
    setError(null);
    setMessage(null);
    try {
      await adminService.updateShow(show.id, { hasSourceMatch: value });
      setMessage('تم حفظ العلامة.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ.');
    }
  }

  async function search() {
    setSearching(true);
    setError(null);
    setHits([]);
    const found: SourceHit[] = [];
    for (const source of SOURCES) {
      try {
        const rows = asArray(
          await getJson(
            `${source.base}/AdvancedSearch?videoTitle=${encodeURIComponent(query)}&type=series`,
          ),
        );
        for (const row of rows.slice(0, 8)) {
          if (row.nb == null) continue;
          found.push({
            source: source.label,
            base: source.base,
            nb: String(row.nb),
            title: String(row.en_title || row.ar_title || ''),
            year: row.year != null ? String(row.year) : '',
          });
        }
      } catch (err) {
        setError(`${source.label}: ${err instanceof Error ? err.message : 'تعذّر الاتصال'}`);
      }
    }
    setHits(found);
    setSearching(false);
  }

  async function inspect(hit: SourceHit) {
    setLoadingKey(`${hit.source}:${hit.nb}`);
    setError(null);
    try {
      const rows = asArray(
        await getJson(`${hit.base}/videoSeason/id/${encodeURIComponent(hit.nb)}`),
      );
      const bySeason = new Map<number, number>();
      for (const row of rows) {
        const season = Number(row.season ?? 1) || 1;
        bySeason.set(season, (bySeason.get(season) ?? 0) + 1);
      }
      const counts = [...bySeason.keys()]
        .sort((a, b) => a - b)
        .map((season) => bySeason.get(season) ?? 0);
      setLayouts((prev) => [
        { source: hit.source, nb: hit.nb, title: hit.title, counts },
        ...prev.filter((l) => !(l.source === hit.source && l.nb === hit.nb)),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر جلب حلقات المصدر.');
    } finally {
      setLoadingKey(null);
    }
  }

  async function apply() {
    if (!layoutValid) return;
    const notes =
      (layoutTotal > currentTotal
        ? `\nسيُضاف ${layoutTotal - currentTotal} حلقة فارغة بلا روابط.`
        : '') +
      (layoutTotal < currentTotal
        ? `\nسيُحذف ${currentTotal - layoutTotal} حلقة من النهاية مع روابطها.`
        : '');
    if (
      !confirm(
        `تحويل "${show.title}" إلى ${layout.length} مواسم (${layout.join(' + ')} = ${layoutTotal} حلقة)؟${notes}`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adminService.restructureShowSeasons(show.id, layout, allowDelete);
      setMessage('تم تغيير ترتيب المواسم.');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تغيير الترتيب.');
    } finally {
      setBusy(false);
    }
  }

  const markLabel =
    show.hasSourceMatch === true
      ? 'متوافق'
      : show.hasSourceMatch === false
        ? 'غير متوافق'
        : 'لم يُختبر';
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold border border-zinc-700 hover:bg-zinc-800';

  return (
    <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-black mb-4">التوافق مع المصادر وترتيب المواسم</h2>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs text-zinc-400">
          العلامة الحالية: <b className="text-white">{markLabel}</b>
        </span>
        <button className={`${btn} text-emerald-400`} onClick={() => void mark(true)}>
          متوافق
        </button>
        <button className={`${btn} text-red-400`} onClick={() => void mark(false)}>
          غير متوافق
        </button>
        <button className={btn} onClick={() => void mark(null)}>
          مسح العلامة
        </button>
      </div>

      <div className="mb-5">
        <p className="text-xs text-zinc-400 mb-2">
          اختبار المصادر (من متصفحك مباشرة): ابحث عن المسلسل ثم اختر النتيجة لرؤية تقسيمها.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-xs bg-black border border-zinc-800 text-white"
          />
          <button className={btn} disabled={searching} onClick={() => void search()}>
            {searching ? <Loader2 size={12} className="animate-spin" /> : 'بحث'}
          </button>
        </div>
        {hits.length > 0 && (
          <div className="space-y-1 mb-3">
            {hits.map((hit) => (
              <button
                key={`${hit.source}:${hit.nb}`}
                onClick={() => void inspect(hit)}
                className="w-full text-start px-3 py-2 rounded-lg text-xs bg-zinc-900 hover:bg-zinc-800"
              >
                <b>{hit.source}</b> · {hit.title} {hit.year && `(${hit.year})`}
                {loadingKey === `${hit.source}:${hit.nb}` && (
                  <Loader2 size={12} className="inline animate-spin ms-2" />
                )}
              </button>
            ))}
          </div>
        )}
        {layouts.map((l) => (
          <div
            key={`${l.source}:${l.nb}`}
            className="flex flex-wrap items-center gap-2 text-xs mb-2"
          >
            <span className="text-zinc-300">
              {l.source} · {l.title}: {l.counts.length} موسم ({l.counts.join(' + ')} ={' '}
              {l.counts.reduce((a, b) => a + b, 0)} حلقة)
            </span>
            <button className={btn} onClick={() => setLayoutText(l.counts.join(', '))}>
              استخدم هذا الترتيب
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-400 mb-2">
          الترتيب الحالي: {currentCounts.length} موسم ({currentCounts.join(' + ')} = {currentTotal}{' '}
          حلقة). اكتب عدد حلقات كل موسم مفصولة بفاصلة:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={layoutText}
            onChange={(e) => setLayoutText(e.target.value)}
            placeholder="9, 6, 8, 8, 10"
            className="w-64 px-3 py-2 rounded-lg text-xs bg-black border border-zinc-800 text-white"
            dir="ltr"
          />
          <span className="text-xs text-zinc-400">
            {layoutValid ? `${layout.length} مواسم · ${layoutTotal} حلقة` : 'أدخل أرقاماً صحيحة'}
          </span>
          {layoutValid && layoutTotal < currentTotal && (
            <label className="text-xs text-amber-400 flex items-center gap-1">
              <input
                type="checkbox"
                checked={allowDelete}
                onChange={(e) => setAllowDelete(e.target.checked)}
              />
              السماح بحذف الحلقات الزائدة
            </label>
          )}
          <button
            className={`${btn} bg-white text-black`}
            disabled={busy || !layoutValid || (layoutTotal < currentTotal && !allowDelete)}
            onClick={() => void apply()}
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} className="inline me-1" />
            )}
            تطبيق الترتيب
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 mt-2">
          الحلقات الحالية تُنقل كما هي (بروابطها وسجل المشاهدة) ولا تُنسخ. إن زاد العدد تُضاف حلقات
          فارغة في النهاية. بعد التطبيق لا تُعيد إعادة الاستيراد من TMDB بناء المواسم.
        </p>
      </div>

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      {message && <p className="text-xs text-emerald-400 mt-3">{message}</p>}
    </section>
  );
}
