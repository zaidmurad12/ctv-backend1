import { MarkRecentButton } from '../../components/MarkRecentButton';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  Download,
  Eye,
  Fingerprint,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AdminLayout } from '../../components/Sidebar';
import { PreviewModal } from '../../components/PreviewModal';
import { SourcePreview } from '../../components/SourcePreview';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import { readSubtitleFileAsText } from '../../lib/subtitleEncoding';
import type {
  AdminMovieDetailDto,
  AdminStreamDto,
  AdminSubtitleDto,
  EditableMovieStatus,
  SubtitleCandidateDto,
} from '../../lib/types';

const STATUSES: EditableMovieStatus[] = ['DRAFT', 'PUBLISHED', 'REMOVED'];

const emptyStream = { quality: '1080p', serverName: '', streamUrl: '', language: '' };
const emptySubtitle = { language: 'ar', format: 'vtt', url: '' };

export default function MovieDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { isLoading, user } = useAuth();

  const [movie, setMovie] = useState<AdminMovieDetailDto | null>(null);
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [overview, setOverview] = useState('');
  const [status, setStatus] = useState<EditableMovieStatus>('DRAFT');
  const [poster, setPoster] = useState('');
  const [backdrop, setBackdrop] = useState('');
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newStream, setNewStream] = useState(emptyStream);
  const [newSubtitle, setNewSubtitle] = useState(emptySubtitle);

  const [subtitleSearchLang, setSubtitleSearchLang] = useState('ar');
  const [subtitleCandidates, setSubtitleCandidates] = useState<SubtitleCandidateDto[] | null>(null);
  const [searchingSubtitles, setSearchingSubtitles] = useState(false);
  const [importingFileId, setImportingFileId] = useState<string | null>(null);
  // Shown right next to the search results instead of the page-level error/message banner up
  // top - that banner sits far above this section, so a failure here read as "nothing happens"
  // since nothing visibly changed anywhere the admin was actually looking.
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [subtitleMessage, setSubtitleMessage] = useState<string | null>(null);

  // For "أرفع ملف الترجمة" - an admin who already has the file downloaded locally, not a
  // working direct-file URL to paste into the form above.
  const [uploadLang, setUploadLang] = useState('ar');
  const [uploadFormat, setUploadFormat] = useState('srt');
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSourcePreview, setShowSourcePreview] = useState(false);

  function load(movieId: string) {
    adminService
      .getMovie(movieId)
      .then((m) => {
        setMovie(m);
        setTitle(m.title);
        setTitleAr(m.titleAr ?? '');
        setOverview(m.overview ?? '');
        // A movie can in principle come back PENDING/INACTIVE (system-managed, not offered as a
        // manual choice below) - falls back to DRAFT rather than a value the dropdown can't
        // actually represent, same as this form has always effectively assumed.
        setStatus(
          (STATUSES as string[]).includes(m.status) ? (m.status as EditableMovieStatus) : 'DRAFT',
        );
        setPoster(m.poster ?? '');
        setBackdrop(m.backdrop ?? '');
        setLogo(m.logo ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل بيانات العمل.'));
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
      await adminService.updateMovie(id, {
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
      await adminService.reimportMovie(id);
      setMessage('تم تحديث المعلومات من TMDB.');
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إعادة الاستيراد.');
    } finally {
      setReimporting(false);
    }
  }

  async function removeMovie() {
    if (!id || !movie) return;
    if (!confirm(`حذف "${movie.title}"؟`)) return;
    setDeleting(true);
    setError(null);
    try {
      await adminService.deleteMovie(id);
      router.push('/movies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف.');
      setDeleting(false);
    }
  }

  async function searchSubtitles() {
    if (!id) return;
    setSearchingSubtitles(true);
    setSubtitleError(null);
    setSubtitleCandidates(null);
    try {
      const found = await adminService.searchSubtitles(id, subtitleSearchLang);
      setSubtitleCandidates(found);
    } catch (err) {
      setSubtitleError(err instanceof Error ? err.message : 'فشل البحث عن ترجمات.');
    } finally {
      setSearchingSubtitles(false);
    }
  }

  // Matches OpenSubtitles by this movie's own file hash instead of title/imdb - finds a subtitle
  // already timed for this *exact* release when one exists, for when a title-based match's own
  // timing doesn't actually line up with this specific file (see MovieHashService's own comment
  // on the backend).
  async function searchSubtitlesByHash() {
    if (!id) return;
    setSearchingSubtitles(true);
    setSubtitleError(null);
    setSubtitleCandidates(null);
    try {
      const found = await adminService.searchSubtitlesByHash(id, subtitleSearchLang);
      setSubtitleCandidates(found);
      if (found.length === 0) {
        setSubtitleError('لم يتم العثور على ترجمة مطابقة لملف هذا الفيلم تحديداً.');
      }
    } catch (err) {
      setSubtitleError(err instanceof Error ? err.message : 'فشلت المطابقة عبر بصمة الملف.');
    } finally {
      setSearchingSubtitles(false);
    }
  }

  async function importSubtitleCandidate(candidate: SubtitleCandidateDto) {
    if (!id) return;
    setImportingFileId(candidate.fileId);
    setSubtitleError(null);
    setSubtitleMessage(null);
    try {
      await adminService.importSubtitleFromSearch(id, candidate.fileId, candidate.language);
      setSubtitleMessage('تم إضافة الترجمة.');
      setSubtitleCandidates(null);
      load(id);
    } catch (err) {
      setSubtitleError(err instanceof Error ? err.message : 'فشل إضافة الترجمة.');
    } finally {
      setImportingFileId(null);
    }
  }

  async function submitStream(event: React.FormEvent) {
    event.preventDefault();
    if (!id || !newStream.streamUrl.trim()) return;
    setError(null);
    try {
      await adminService.addStream(id, {
        quality: newStream.quality,
        serverName: newStream.serverName || undefined,
        streamUrl: newStream.streamUrl.trim(),
        language: newStream.language || undefined,
      });
      setNewStream(emptyStream);
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة رابط التشغيل.');
    }
  }

  async function toggleStreamActive(s: AdminStreamDto) {
    if (!id) return;
    try {
      await adminService.updateStream(s.id, { isActive: !s.isActive });
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحديث السيرفر.');
    }
  }

  async function removeStream(streamId: string) {
    if (!id) return;
    try {
      await adminService.deleteStream(streamId);
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف السيرفر.');
    }
  }

  async function submitSubtitle(event: React.FormEvent) {
    event.preventDefault();
    if (!id || !newSubtitle.url.trim()) return;
    setError(null);
    try {
      await adminService.addSubtitle(id, {
        language: newSubtitle.language,
        format: newSubtitle.format || undefined,
        url: newSubtitle.url.trim(),
      });
      setNewSubtitle(emptySubtitle);
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة الترجمة.');
    }
  }

  async function uploadSubtitleFile(file: File) {
    if (!id) return;
    setUploadingSubtitle(true);
    setSubtitleError(null);
    setSubtitleMessage(null);
    try {
      const content = await readSubtitleFileAsText(file, uploadLang);
      await adminService.uploadSubtitle(id, uploadLang, uploadFormat, content);
      setSubtitleMessage('تم رفع الترجمة.');
      load(id);
    } catch (err) {
      setSubtitleError(err instanceof Error ? err.message : 'فشل رفع الترجمة.');
    } finally {
      setUploadingSubtitle(false);
    }
  }

  async function removeSubtitle(subtitleId: string) {
    if (!id) return;
    try {
      await adminService.deleteSubtitle(subtitleId);
      load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الترجمة.');
    }
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <button
        type="button"
        // router.back() (real browser history back) instead of push('/movies') - the movies list
        // reads its filters/search/page back out of the URL on mount, so this is what actually
        // lands back on the exact same filtered view instead of a blank one.
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-white transition-colors mb-4"
      >
        <ArrowRight size={13} />
        العودة إلى الأعمال
      </button>

      {!movie ? (
        error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-zinc-500">جارٍ التحميل...</p>
        )
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h1 className="text-2xl font-black">{movie.title}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-300 border border-zinc-800 hover:bg-zinc-900 transition-colors"
              >
                <Eye size={12} />
                معاينة
              </button>
              <button
                type="button"
                onClick={() => setShowSourcePreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-sky-300 border border-sky-900 hover:bg-zinc-900 transition-colors"
              >
                <Eye size={12} />
                معاينة من المصادر
              </button>
              <MarkRecentButton type="movie" id={movie.id} />
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
                disabled={deleting}
                onClick={() => void removeMovie()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                حذف
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-500 mb-8">
            {movie.hasPlayableStream
              ? 'يملك رابط تشغيل فعّال حاليًا.'
              : 'لا يوجد رابط تشغيل بعد — سيظهر "قريبًا" في التطبيق.'}
          </p>

          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          {message && <p className="text-sm text-emerald-400 mb-4">{message}</p>}

          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-black mb-4">بيانات العمل</h2>
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
            {/* Manual overrides only - a plain URL, never an upload. The app calls these links
                directly and never downloads/rehosts them, same rule streams/subtitles follow. */}
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

          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-black mb-4">سيرفرات التشغيل</h2>
            {movie.streams.length === 0 && (
              <p className="text-xs text-zinc-600 mb-4">
                لا يوجد أي رابط تشغيل — لن يظهر زر التشغيل في التطبيق.
              </p>
            )}
            <div className="space-y-2 mb-4">
              {movie.streams.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-4 py-3"
                >
                  <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-900 text-[11px] font-bold">
                    {s.quality}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" dir="ltr">
                      {s.streamUrl}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      {s.serverName || 'بدون اسم'} {s.language && `· ${s.language}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleStreamActive(s)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                      s.isActive
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    {s.isActive ? 'فعّال' : 'معطّل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeStream(s.id)}
                    className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={submitStream}>
              <div className="mb-2">
                <label className="block text-[11px] text-zinc-500 mb-1">رابط التشغيل</label>
                <input
                  dir="ltr"
                  value={newStream.streamUrl}
                  onChange={(e) => setNewStream({ ...newStream, streamUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                />
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="w-24 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">الجودة</label>
                  <input
                    value={newStream.quality}
                    onChange={(e) => setNewStream({ ...newStream, quality: e.target.value })}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="w-32 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">اسم السيرفر</label>
                  <input
                    value={newStream.serverName}
                    onChange={(e) => setNewStream({ ...newStream, serverName: e.target.value })}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="w-20 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">اللغة</label>
                  <input
                    value={newStream.language}
                    onChange={(e) => setNewStream({ ...newStream, language: e.target.value })}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
                >
                  <Plus size={13} />
                  إضافة
                </button>
              </div>
            </form>
          </section>

          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-sm font-black mb-4">ملفات الترجمة</h2>
            {movie.subtitles.length === 0 && (
              <p className="text-xs text-zinc-600 mb-4">لا توجد ترجمات مضافة بعد.</p>
            )}
            <div className="space-y-2 mb-4">
              {movie.subtitles.map((s: AdminSubtitleDto) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-black border border-zinc-800 rounded-lg px-4 py-3"
                >
                  <span className="shrink-0 px-2 py-0.5 rounded bg-zinc-900 text-[11px] font-bold">
                    {s.language}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" dir="ltr">
                      {s.url}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{s.format}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSubtitle(s.id)}
                    className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mb-5 pb-5 border-b border-zinc-800">
              <h3 className="text-xs font-black text-zinc-400 mb-2">البحث عبر OpenSubtitles</h3>
              <div className="flex items-end gap-2 mb-3">
                <div className="w-24">
                  <label className="block text-[11px] text-zinc-500 mb-1">اللغة</label>
                  <input
                    value={subtitleSearchLang}
                    onChange={(e) => setSubtitleSearchLang(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
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

              {subtitleError && <p className="text-xs text-red-400 mb-3">{subtitleError}</p>}
              {subtitleMessage && (
                <p className="text-xs text-emerald-400 mb-3">{subtitleMessage}</p>
              )}

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

            <h3 className="text-xs font-black text-zinc-400 mb-2">إضافة رابط يدويًا</h3>
            <form onSubmit={submitSubtitle}>
              <div className="mb-2">
                <label className="block text-[11px] text-zinc-500 mb-1">رابط الترجمة</label>
                <input
                  dir="ltr"
                  value={newSubtitle.url}
                  onChange={(e) => setNewSubtitle({ ...newSubtitle, url: e.target.value })}
                  placeholder="https://..."
                  className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                />
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="w-20 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">اللغة</label>
                  <input
                    value={newSubtitle.language}
                    onChange={(e) => setNewSubtitle({ ...newSubtitle, language: e.target.value })}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="w-20 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">الصيغة</label>
                  <input
                    value={newSubtitle.format}
                    onChange={(e) => setNewSubtitle({ ...newSubtitle, format: e.target.value })}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors"
                >
                  <Plus size={13} />
                  إضافة
                </button>
              </div>
            </form>

            <div className="mt-5 pt-5 border-t border-zinc-800">
              <h3 className="text-xs font-black text-zinc-400 mb-2">رفع ملف الترجمة</h3>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="w-20 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">اللغة</label>
                  <input
                    value={uploadLang}
                    onChange={(e) => setUploadLang(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="w-20 shrink-0">
                  <label className="block text-[11px] text-zinc-500 mb-1">الصيغة</label>
                  <input
                    value={uploadFormat}
                    onChange={(e) => setUploadFormat(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                  />
                </div>
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
          </section>

          {showSourcePreview && (
            <SourcePreview
              title={movie.title}
              altTitle={movie.titleAr}
              kind="movie"
              linkedSources={movie.sourceLinks}
              onSaveLinks={async (links) => {
                if (!id) return;
                await adminService.updateMovie(id, { sourceLinks: links });
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
              title={movie.title}
              streams={movie.streams}
              subtitles={movie.subtitles}
              poster={poster}
              backdrop={backdrop}
              logo={logo}
              onClose={() => setShowPreview(false)}
              onSaved={() => id && load(id)}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}
