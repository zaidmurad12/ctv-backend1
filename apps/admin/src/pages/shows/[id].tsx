import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Fingerprint,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AdminLayout } from '../../components/Sidebar';
import { PreviewModal } from '../../components/PreviewModal';
import { SourcePreview } from '../../components/SourcePreview';
import { SeasonCompatibilityPanel } from '../../components/SeasonCompatibilityPanel';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import { readSubtitleFileAsText } from '../../lib/subtitleEncoding';
import type {
  AdminEpisodeSummaryDto,
  AdminSeasonSummaryDto,
  AdminShowDetailDto,
  AdminStreamDto,
  AdminSubtitleDto,
  EditableMovieStatus,
  SubtitleCandidateDto,
} from '../../lib/types';

const STATUSES: EditableMovieStatus[] = ['DRAFT', 'PUBLISHED', 'REMOVED'];

// A season/episode only ever gets imported once it's aired or airing within a week (see
// AIR_DATE_IMPORT_HORIZON_DAYS in bootstrap-importer.mjs) - anything with a future airDate here
// is specifically that "coming soon" case, worth calling out since it explains why it has no
// stream/subtitle yet without that reading as something needing action.
function upcomingLabel(airDate: string | null | undefined): string | null {
  if (!airDate) return null;
  const date = new Date(airDate);
  if (date.getTime() <= Date.now()) return null;
  return `قادمة - ${date.toLocaleDateString('ar', { day: 'numeric', month: 'short' })}`;
}

export default function ShowDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { isLoading, user } = useAuth();

  const [show, setShow] = useState<AdminShowDetailDto | null>(null);
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [overview, setOverview] = useState('');
  const [status, setStatus] = useState<EditableMovieStatus>('DRAFT');
  const [poster, setPoster] = useState('');
  const [backdrop, setBackdrop] = useState('');
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null);

  function load(showId: string) {
    adminService
      .getShow(showId)
      .then((s) => {
        setShow(s);
        setTitle(s.title);
        setTitleAr(s.titleAr ?? '');
        setOverview(s.overview ?? '');
        // See movies/[id].tsx's own comment - a show can in principle come back PENDING/
        // INACTIVE, which this dropdown doesn't offer as a manual choice.
        setStatus(
          (STATUSES as string[]).includes(s.status) ? (s.status as EditableMovieStatus) : 'DRAFT',
        );
        setPoster(s.poster ?? '');
        setBackdrop(s.backdrop ?? '');
        setLogo(s.logo ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل بيانات المسلسل.'));
  }

  useEffect(() => {
    if (user && id) load(id);
  }, [user, id]);

  async function saveDetails() {
    if (!id) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminService.updateShow(id, {
        title,
        titleAr,
        overview,
        status,
        poster: poster.trim() || undefined,
        backdrop: backdrop.trim() || undefined,
        logo: logo.trim() || undefined,
      });
      setMessage('تم حفظ التعديلات.');
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ التعديلات.');
    } finally {
      setSaving(false);
    }
  }

  async function reimport() {
    if (!id) return;
    setReimporting(true);
    setError(null);
    setMessage(null);
    try {
      await adminService.reimportShow(id);
      setMessage('تم تحديث المعلومات والحلقات من TMDB.');
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إعادة الاستيراد.');
    } finally {
      setReimporting(false);
    }
  }

  const [refreshingImages, setRefreshingImages] = useState(false);
  async function refreshEpisodeImages() {
    if (!id) return;
    setRefreshingImages(true);
    setError(null);
    setMessage(null);
    try {
      const r = await adminService.refreshShowEpisodeImages(id);
      setMessage(
        (r.mode === 'realigned'
          ? `ترتيب المواسم هنا يختلف عن TMDB، فأعيدت مطابقة الحلقات بالتسلسل (الصور والعناوين والوصف): `
          : 'صور الحلقات: ') +
          `${r.updated} حُدّثت، ${r.unchanged} بدون تغيير، ${r.missing} بلا بيانات في TMDB.`,
      );
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إعادة استيراد صور الحلقات.');
    } finally {
      setRefreshingImages(false);
    }
  }

  async function removeShow() {
    if (!id || !show) return;
    if (!confirm(`حذف "${show.title}"؟`)) return;
    setDeleting(true);
    setError(null);
    try {
      await adminService.deleteShow(id);
      router.push('/shows');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف.');
      setDeleting(false);
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-white transition-colors mb-4"
      >
        <ArrowRight size={13} />
        العودة إلى المسلسلات
      </button>

      {!show ? (
        error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-zinc-500">جارٍ التحميل...</p>
        )
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="text-2xl font-black">{show.title}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors"
              >
                <Eye size={12} />
                معاينة الصور
              </button>
              <button
                type="button"
                onClick={() => setShowSourcePreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-sky-300 border border-sky-900 hover:bg-zinc-900 transition-colors"
              >
                <Eye size={12} />
                معاينة من المصادر
              </button>
              <button
                type="button"
                disabled={reimporting}
                onClick={() => void reimport()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors disabled:opacity-50"
              >
                {reimporting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                إعادة استيراد من TMDB
              </button>
              <button
                type="button"
                disabled={refreshingImages}
                onClick={() => void refreshEpisodeImages()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors disabled:opacity-50"
              >
                {refreshingImages ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                إعادة استيراد صور الحلقات
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void removeShow()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                حذف
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-500 mb-8">
            {show.numberOfSeasons} موسم · {show.numberOfEpisodes} حلقة
          </p>

          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          {message && <p className="text-sm text-emerald-400 mb-4">{message}</p>}

          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-black mb-4">بيانات المسلسل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">العنوان (إنجليزي)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-3 text-sm outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">العنوان (عربي)</label>
                <input
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-3 text-sm outline-none focus:border-zinc-600"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-zinc-500 mb-1.5">القصة</label>
              <textarea
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={4}
                className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-3 text-sm outline-none focus:border-zinc-600 resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">رابط البوستر</label>
                <input
                  dir="ltr"
                  value={poster}
                  onChange={(e) => setPoster(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-3 text-xs outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">رابط الخلفية</label>
                <input
                  dir="ltr"
                  value={backdrop}
                  onChange={(e) => setBackdrop(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-3 text-xs outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">رابط الشعار</label>
                <input
                  dir="ltr"
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-3 text-xs outline-none focus:border-zinc-600"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1.5">الحالة</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EditableMovieStatus)}
                  className="bg-black border border-zinc-800 rounded-lg py-2 px-3 text-sm outline-none focus:border-zinc-600"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDetails()}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </section>

          <SeasonCompatibilityPanel key={show.seasons.length + ':' + show.hasSourceMatch} show={show} onChanged={() => id && load(id)} />

          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-black mb-4">المواسم والحلقات</h2>
            <div className="space-y-4">
              {show.seasons.map((season: AdminSeasonSummaryDto) => (
                <div key={season.id} className="border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-black/40 text-xs font-black text-zinc-300 flex items-center gap-2">
                    <span>
                      الموسم {season.seasonNumber}
                      {season.name ? ` — ${season.name}` : ''} · {season.episodes.length} حلقة
                    </span>
                    {upcomingLabel(season.airDate) && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px] font-bold">
                        {upcomingLabel(season.airDate)}
                      </span>
                    )}
                  </div>
                  <div>
                    {season.episodes.map((episode: AdminEpisodeSummaryDto, i: number) => (
                      <EpisodeRow
                        key={episode.id}
                        episode={episode}
                        originalLanguage={show.originalLanguage}
                        expanded={expandedEpisode === episode.id}
                        onToggle={() =>
                          setExpandedEpisode((cur) => (cur === episode.id ? null : episode.id))
                        }
                        onChanged={() => id && load(id)}
                        bordered={i > 0}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {show.seasons.length === 0 && (
                <p className="text-xs text-zinc-600">
                  لا توجد مواسم بعد — جرّب "إعادة استيراد من TMDB".
                </p>
              )}
            </div>
          </section>

          {showSourcePreview && (
            <SourcePreview
              title={show.title}
              altTitle={show.titleAr}
              kind="series"
              linkedSources={show.sourceLinks}
              onSaveLinks={async (links) => {
                if (!id) return;
                await adminService.updateShow(id, { sourceLinks: links });
                load(id);
              }}
              poster={poster}
              backdrop={backdrop}
              logo={logo}
              onClose={() => setShowSourcePreview(false)}
            />
          )}

          {showPreview && (
            <PreviewModal
              title={show.title}
              streams={[]}
              subtitles={[]}
              poster={poster}
              backdrop={backdrop}
              logo={logo}
              onClose={() => setShowPreview(false)}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}

const emptyStream = { quality: '1080p', serverName: '', streamUrl: '', language: '' };
const emptySubtitle = { language: 'ar', format: 'vtt', url: '' };

function EpisodeRow({
  episode,
  originalLanguage,
  expanded,
  onToggle,
  onChanged,
  bordered,
}: {
  episode: AdminEpisodeSummaryDto;
  // The parent show's own original language (episodes have no language of their own) - an
  // Arabic-original show doesn't need an Arabic subtitle, so its episodes shouldn't show the
  // "بدون ترجمة" badge just because none exists.
  originalLanguage?: string | null;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
  bordered: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [newStream, setNewStream] = useState(emptyStream);
  const [newSubtitle, setNewSubtitle] = useState(emptySubtitle);
  const [subtitleSearchLang, setSubtitleSearchLang] = useState('ar');
  const [subtitleCandidates, setSubtitleCandidates] = useState<SubtitleCandidateDto[] | null>(null);
  const [searchingSubtitles, setSearchingSubtitles] = useState(false);
  const [importingFileId, setImportingFileId] = useState<string | null>(null);
  const [uploadLang, setUploadLang] = useState('ar');
  const [uploadFormat, setUploadFormat] = useState('srt');
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  async function submitStream(event: React.FormEvent) {
    event.preventDefault();
    if (!newStream.streamUrl.trim()) return;
    setError(null);
    try {
      await adminService.addEpisodeStream(episode.id, {
        quality: newStream.quality,
        serverName: newStream.serverName || undefined,
        streamUrl: newStream.streamUrl.trim(),
        language: newStream.language || undefined,
      });
      setNewStream(emptyStream);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة رابط التشغيل.');
    }
  }

  async function toggleStreamActive(s: AdminStreamDto) {
    try {
      await adminService.updateStream(s.id, { isActive: !s.isActive });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث السيرفر.');
    }
  }

  async function removeStream(streamId: string) {
    try {
      await adminService.deleteStream(streamId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف السيرفر.');
    }
  }

  async function submitSubtitle(event: React.FormEvent) {
    event.preventDefault();
    if (!newSubtitle.url.trim()) return;
    setError(null);
    try {
      await adminService.addEpisodeSubtitle(episode.id, {
        language: newSubtitle.language,
        format: newSubtitle.format || undefined,
        url: newSubtitle.url.trim(),
      });
      setNewSubtitle(emptySubtitle);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة الترجمة.');
    }
  }

  async function removeSubtitle(subtitleId: string) {
    try {
      await adminService.deleteSubtitle(subtitleId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الترجمة.');
    }
  }

  async function uploadSubtitleFile(file: File) {
    setUploadingSubtitle(true);
    setError(null);
    try {
      const content = await readSubtitleFileAsText(file, uploadLang);
      await adminService.uploadEpisodeSubtitle(episode.id, uploadLang, uploadFormat, content);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الترجمة.');
    } finally {
      setUploadingSubtitle(false);
    }
  }

  async function searchSubtitles() {
    setSearchingSubtitles(true);
    setError(null);
    setSubtitleCandidates(null);
    try {
      const found = await adminService.searchEpisodeSubtitles(episode.id, subtitleSearchLang);
      setSubtitleCandidates(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل البحث عن ترجمات.');
    } finally {
      setSearchingSubtitles(false);
    }
  }

  // Matches OpenSubtitles by this episode's own file hash instead of title/imdb - see
  // MovieHashService's own comment on the backend for why that finds a subtitle actually timed
  // for this exact file, when one exists.
  async function searchSubtitlesByHash() {
    setSearchingSubtitles(true);
    setError(null);
    setSubtitleCandidates(null);
    try {
      const found = await adminService.searchEpisodeSubtitlesByHash(episode.id, subtitleSearchLang);
      setSubtitleCandidates(found);
      if (found.length === 0) {
        setError('لم يتم العثور على ترجمة مطابقة لملف هذه الحلقة تحديداً.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت المطابقة عبر بصمة الملف.');
    } finally {
      setSearchingSubtitles(false);
    }
  }

  async function importSubtitleCandidate(candidate: SubtitleCandidateDto) {
    setImportingFileId(candidate.fileId);
    setError(null);
    try {
      await adminService.importEpisodeSubtitleFromSearch(
        episode.id,
        candidate.fileId,
        candidate.language,
      );
      setSubtitleCandidates(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة الترجمة.');
    } finally {
      setImportingFileId(null);
    }
  }

  return (
    <div className={bordered ? 'border-t border-zinc-800' : ''}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 text-start hover:bg-zinc-900/50 transition-colors"
      >
        {episode.stillImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.stillImage}
            alt=""
            className="w-16 h-9 object-cover rounded-md bg-zinc-900 shrink-0"
          />
        ) : (
          <div className="w-16 h-9 rounded-md bg-zinc-900 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">
            {episode.episodeNumber}. {episode.title}
          </div>
        </div>
        {upcomingLabel(episode.airDate) && (
          <span className="shrink-0 px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px] font-bold">
            {upcomingLabel(episode.airDate)}
          </span>
        )}
        <span
          className={`shrink-0 flex items-center gap-1 text-[11px] font-bold ${
            episode.hasPlayableStream ? 'text-emerald-400' : 'text-zinc-600'
          }`}
        >
          <PlayCircle size={13} />
          {episode.hasPlayableStream ? 'جاهزة' : 'بدون رابط'}
        </span>
        {!episode.hasSubtitles && originalLanguage !== 'ar' && (
          <span className="shrink-0 text-[11px] font-bold text-zinc-600">بدون ترجمة</span>
        )}
        {expanded ? (
          <ChevronUp size={16} className="shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-1 bg-black/20">
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

          <div className="flex items-center justify-between mb-2 mt-2">
            <h3 className="text-xs font-black text-zinc-400">سيرفرات التشغيل</h3>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors"
            >
              <Eye size={11} />
              معاينة
            </button>
          </div>
          <div className="space-y-2 mb-3">
            {episode.streams.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-3 py-2.5"
              >
                <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-900 text-[11px] font-bold">
                  {s.quality}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" dir="ltr">
                    {s.streamUrl}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {s.serverName || 'بدون اسم'} {s.language && `· ${s.language}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleStreamActive(s)}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    s.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {s.isActive ? 'فعّال' : 'معطّل'}
                </button>
                <button
                  type="button"
                  onClick={() => void removeStream(s.id)}
                  className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {episode.streams.length === 0 && (
              <p className="text-xs text-zinc-600">لا يوجد رابط تشغيل لهذه الحلقة بعد.</p>
            )}
          </div>
          <form onSubmit={submitStream} className="mb-5 pb-5 border-b border-zinc-800">
            <div className="mb-2">
              <input
                dir="ltr"
                value={newStream.streamUrl}
                onChange={(e) => setNewStream({ ...newStream, streamUrl: e.target.value })}
                placeholder="رابط التشغيل https://..."
                className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <input
                value={newStream.quality}
                onChange={(e) => setNewStream({ ...newStream, quality: e.target.value })}
                placeholder="الجودة"
                className="w-24 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <input
                value={newStream.serverName}
                onChange={(e) => setNewStream({ ...newStream, serverName: e.target.value })}
                placeholder="اسم السيرفر"
                className="w-32 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <input
                value={newStream.language}
                onChange={(e) => setNewStream({ ...newStream, language: e.target.value })}
                placeholder="اللغة"
                className="w-20 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <button
                type="submit"
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                <Plus size={13} />
                إضافة
              </button>
            </div>
          </form>

          <h3 className="text-xs font-black text-zinc-400 mb-2">ملفات الترجمة</h3>
          <div className="space-y-2 mb-3">
            {episode.subtitles.map((s: AdminSubtitleDto) => (
              <div
                key={s.id}
                className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-3 py-2.5"
              >
                <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-900 text-[11px] font-bold">
                  {s.language}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" dir="ltr">
                    {s.url}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {s.format}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSubtitle(s.id)}
                  className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {episode.subtitles.length === 0 && (
              <p className="text-xs text-zinc-600">لا توجد ترجمات مضافة بعد.</p>
            )}
          </div>

          <div className="mb-4 pb-4 border-b border-zinc-800">
            <h4 className="text-[11px] font-black text-zinc-500 mb-2">البحث عبر OpenSubtitles</h4>
            <div className="flex items-end gap-2 mb-3">
              <input
                value={subtitleSearchLang}
                onChange={(e) => setSubtitleSearchLang(e.target.value)}
                className="w-20 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                disabled={searchingSubtitles}
                onClick={() => void searchSubtitles()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {searchingSubtitles ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Search size={13} />
                )}
                بحث
              </button>
              <button
                type="button"
                disabled={searchingSubtitles}
                onClick={() => void searchSubtitlesByHash()}
                title="يبحث بمطابقة ملف الفيديو نفسه بدل العنوان - يجد ترجمة مضبوطة على هذه النسخة تحديداً"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-800 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {searchingSubtitles ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Fingerprint size={13} />
                )}
                مطابقة عبر بصمة الملف
              </button>
            </div>
            {subtitleCandidates &&
              (subtitleCandidates.length === 0 ? (
                <p className="text-xs text-zinc-600">لم يتم العثور على نتائج.</p>
              ) : (
                <div className="space-y-2">
                  {subtitleCandidates.map((c) => (
                    <div
                      key={c.fileId}
                      className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-3 py-2.5"
                    >
                      <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-900 text-[11px] font-bold">
                        {c.language}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate">{c.releaseName}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {c.downloadCount.toLocaleString()} تنزيل · تقييم {c.rating.toFixed(1)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={importingFileId === c.fileId}
                        onClick={() => void importSubtitleCandidate(c)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      >
                        {importingFileId === c.fileId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        إضافة
                      </button>
                    </div>
                  ))}
                </div>
              ))}
          </div>

          <h4 className="text-[11px] font-black text-zinc-500 mb-2">إضافة رابط يدويًا</h4>
          <form onSubmit={submitSubtitle}>
            <div className="mb-2">
              <input
                dir="ltr"
                value={newSubtitle.url}
                onChange={(e) => setNewSubtitle({ ...newSubtitle, url: e.target.value })}
                placeholder="رابط الترجمة https://..."
                className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <input
                value={newSubtitle.language}
                onChange={(e) => setNewSubtitle({ ...newSubtitle, language: e.target.value })}
                placeholder="اللغة"
                className="w-20 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <input
                value={newSubtitle.format}
                onChange={(e) => setNewSubtitle({ ...newSubtitle, format: e.target.value })}
                placeholder="الصيغة"
                className="w-20 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <button
                type="submit"
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                <Plus size={13} />
                إضافة
              </button>
            </div>
          </form>

          <div className="mt-4 pt-4 border-t border-zinc-800">
            <h4 className="text-[11px] font-black text-zinc-500 mb-2">رفع ملف الترجمة</h4>
            <div className="flex items-end gap-2 flex-wrap">
              <input
                value={uploadLang}
                onChange={(e) => setUploadLang(e.target.value)}
                placeholder="اللغة"
                className="w-20 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <input
                value={uploadFormat}
                onChange={(e) => setUploadFormat(e.target.value)}
                placeholder="الصيغة"
                className="w-20 shrink-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
              />
              <label className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer disabled:opacity-50">
                {uploadingSubtitle ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Upload size={13} />
                )}
                اختر ملفاً (.srt / .vtt)
                <input
                  type="file"
                  accept=".srt,.vtt,text/plain"
                  disabled={uploadingSubtitle}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void uploadSubtitleFile(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <PreviewModal
          title={`الحلقة ${episode.episodeNumber} — ${episode.title}`}
          streams={episode.streams}
          subtitles={episode.subtitles}
          poster={episode.stillImage}
          onClose={() => setShowPreview(false)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
