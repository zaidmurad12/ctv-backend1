import { useEffect, useMemo, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { adminService } from '../services/adminService';
import type { AdminStreamDto, AdminSubtitleDto } from '../lib/types';
import { srtToVtt, isVtt } from '../lib/srtToVtt';
import { API_BASE_URL } from '../lib/apiClient';
import { tokenStorage } from '../lib/tokenStorage';

// See streamProxy.controller.ts's own comment: hls.js's XHR/fetch requests (unlike react-native-
// video's native playback in the app, and unlike Safari's own OS-level HLS player below) are
// bound by the browser's CORS policy, and these source CDNs have no reason to allow this
// dashboard's origin - reported as "some links don't work in the control panel." Routing through
// this backend's own origin instead sidesteps that.
function proxiedStreamUrl(url: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/admin/stream-proxy?url=${encodeURIComponent(url)}`;
}

interface Props {
  title: string;
  streams: readonly AdminStreamDto[];
  subtitles: readonly AdminSubtitleDto[];
  poster?: string | null;
  backdrop?: string | null;
  logo?: string | null;
  onClose: () => void;
  // Refetches the movie/episode after a sync value is saved, so reopening this same modal (or
  // the plain subtitle list behind it) reflects the new default instead of the stale one already
  // in memory.
  onSaved?: () => void;
}

const NONE = '__none';

// Same step sizes/bounds VideoPlayer.tsx's own manual sync steppers use (see its OFFSET_STEP_MS/
// SPEED_STEP/MAX_OFFSET_MS/MIN_SPEED/MAX_SPEED) - keeping them identical means a value tuned here
// and one tuned on-device land on the same achievable numbers.
const OFFSET_STEP_MS = 250;
const MAX_OFFSET_MS = 60000;
const SPEED_STEP = 0.005;
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.18;

interface CueTime {
  readonly start: number;
  readonly end: number;
}

// WebVTT timestamps are "HH:MM:SS.mmm" or "MM:SS.mmm" - both appear in the wild depending on
// what produced the file. Parses whichever form each cue uses into plain seconds.
function parseVttTimestamp(raw: string): number {
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(raw) || 0;
}

const CUE_LINE = /(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/g;

function parseCueTimes(vtt: string): CueTime[] {
  const matches = vtt.match(CUE_LINE) ?? [];
  return matches.map((line) => {
    const [start, end] = line.split('-->').map((s) => s.trim());
    return { start: parseVttTimestamp(start), end: parseVttTimestamp(end) };
  });
}

// Shared by the movie and episode detail pages - a quick way to actually watch the poster/
// backdrop/logo images, play a stream with a chosen subtitle burned in as a <track>, adjust that
// subtitle's timing/speed live against the real video, and save the result as the default sync
// every future viewer gets (Subtitle.defaultOffsetMs/defaultSpeed - the same fields the automatic
// server-side analysis sets, just manually correctable here too).
export function PreviewModal({
  title,
  streams,
  subtitles,
  poster,
  backdrop,
  logo,
  onClose,
  onSaved,
}: Props) {
  const [streamId, setStreamId] = useState(
    () =>
      streams.find((s) => s.isActive && s.isDefault)?.id ??
      streams.find((s) => s.isActive)?.id ??
      streams[0]?.id ??
      '',
  );
  const [subtitleId, setSubtitleId] = useState<string>(NONE);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [loadingSubtitle, setLoadingSubtitle] = useState(false);

  const [offsetMs, setOffsetMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [streamError, setStreamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const originalCuesRef = useRef<CueTime[]>([]);

  const stream = streams.find((s) => s.id === streamId);
  const subtitle = subtitles.find((s) => s.id === subtitleId);

  // Every stream in this catalog is served as HLS - react-native-video plays that fine (ExoPlayer
  // supports it natively on Android), but a plain browser <video src> only ever plays it in
  // Safari; Chrome/Firefox/Edge silently fail to load it at all - reported as "some movie links
  // don't work in the browser preview but load fine in the app." hls.js is the standard
  // MediaSource-based polyfill for exactly this gap; native support (Safari) is used as-is
  // instead, since it's more efficient than routing through hls.js unnecessarily.
  //
  // This used to gate the whole effect on HLS_URL (a plain ".m3u8" match against the URL text)
  // and skip straight to a plain <source> otherwise - reported as "this link still doesn't work,"
  // traced to a real stream URL that's genuinely HLS but served behind an opaque, tokenized path
  // with no ".m3u8" anywhere in it (some CDNs deliberately hide their real file structure this
  // way). Since every stream here actually is HLS regardless of what its URL happens to look
  // like (see this comment's own first line - a documented invariant of this catalog, not a
  // guess), there's nothing left for a plain <source> fallback to ever legitimately handle -
  // removed below along with the check gating it.
  useEffect(() => {
    setStreamError(null);
    const video = videoRef.current;
    if (!video || !stream) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively - the JSX below deliberately omits a <source> for any .m3u8
      // URL (to avoid it competing with hls.js's own MediaSource attachment in the other browsers
      // this effect actually exists for), so this is the one browser where `src` has to be set
      // here instead.
      video.src = stream.streamUrl;
      return;
    }

    let cancelled = false;
    import('hls.js').then(({ default: HlsCtor }) => {
      if (cancelled) return;
      if (!HlsCtor.isSupported()) {
        setStreamError('هذا المتصفح لا يدعم تشغيل روابط HLS حتى مع hls.js.');
        return;
      }
      // xhrSetup carries the admin's own bearer token onto every manifest/segment request hls.js
      // makes - the stream-proxy route is @Roles('ADMIN')-gated like the rest of the admin API,
      // same as every other adminService call already sends this token.
      const hls = new HlsCtor({
        xhrSetup: (xhr) => {
          const token = tokenStorage.getAccessToken();
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
      });
      hlsRef.current = hls;
      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStreamError(`تعذّر تشغيل الفيديو (${data.details}).`);
        }
      });
      hls.loadSource(proxiedStreamUrl(stream.streamUrl));
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [stream?.id, stream?.streamUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setTrackUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSubtitleError(null);
    setSaveMessage(null);
    originalCuesRef.current = [];
    // Starts from whatever's already saved for this subtitle, not 0/1 - the point of this panel
    // is to *adjust* the existing default, same as a fresh subtitle-settings open in the app
    // itself would.
    setOffsetMs(subtitle?.defaultOffsetMs ?? 0);
    setSpeed(subtitle?.defaultSpeed ?? 1);
    if (!subtitle) return;

    let cancelled = false;
    setLoadingSubtitle(true);
    fetch(subtitle.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const vtt = isVtt(subtitle.format, text) ? text : srtToVtt(text);
        originalCuesRef.current = parseCueTimes(vtt);
        const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        setTrackUrl(blobUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setSubtitleError(
            err instanceof Error
              ? `تعذّر تحميل الترجمة للمعاينة (${err.message}) - قد يمنع المصدر الوصول من متصفح خارجي.`
              : 'تعذّر تحميل الترجمة للمعاينة.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSubtitle(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleId]);

  useEffect(() => {
    return () => {
      if (trackUrl) URL.revokeObjectURL(trackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-times every cue from its *original* (unshifted) position every time offset/speed change -
  // never incrementally from whatever's currently showing, which would compound each adjustment
  // on top of the last instead of always reflecting the true total offset/speed value the steppers
  // display. Requires the track's cue list to already be populated, which only happens once the
  // browser has actually parsed the WebVTT resource - the <track onLoad> below is what guarantees
  // that's already true the first time this runs for a freshly picked subtitle.
  function applySync(nextOffsetMs: number, nextSpeed: number) {
    const track = videoRef.current?.textTracks?.[0];
    const cues = track?.cues;
    const originals = originalCuesRef.current;
    if (!track || !cues) return;
    track.mode = 'showing';
    const offsetSec = nextOffsetMs / 1000;
    for (let i = 0; i < cues.length && i < originals.length; i++) {
      const cue = cues[i] as VTTCue;
      cue.startTime = originals[i].start * nextSpeed + offsetSec;
      cue.endTime = originals[i].end * nextSpeed + offsetSec;
    }
  }

  useEffect(() => {
    applySync(offsetMs, speed);
     
  }, [offsetMs, speed, trackUrl]);

  function changeOffset(delta: number) {
    setOffsetMs((v) => Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, v + delta)));
  }

  function changeSpeed(delta: number) {
    setSpeed((v) =>
      Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.round((v + delta) * 1000) / 1000)),
    );
  }

  async function saveSync() {
    if (!subtitle) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await adminService.updateSubtitle(subtitle.id, {
        defaultOffsetMs: Math.round(offsetMs),
        defaultSpeed: speed,
      });
      setSaveMessage('تم الحفظ - سيُطبَّق هذا التصحيح تلقائيًا لكل المشاهدين.');
      onSaved?.();
    } catch (err) {
      setSaveMessage(err instanceof Error ? `فشل الحفظ: ${err.message}` : 'فشل الحفظ.');
    } finally {
      setSaving(false);
    }
  }

  const images = useMemo(
    () =>
      [
        { label: 'البوستر', url: poster },
        { label: 'الخلفية', url: backdrop },
        { label: 'الشعار', url: logo },
      ].filter((img): img is { label: string; url: string } => !!img.url),
    [poster, backdrop, logo],
  );

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black">معاينة — {title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {images.length > 0 && (
          <div className="flex items-start gap-4 mb-5 pb-5 border-b border-zinc-800">
            {images.map((img) => (
              <div key={img.label} className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-500 mb-1.5">{img.label}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.label}
                  className="w-full h-28 object-contain bg-black border border-zinc-800 rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '0.25';
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {streams.length === 0 ? (
          <p className="text-xs text-zinc-600">لا يوجد رابط تشغيل لمعاينته.</p>
        ) : (
          <>
            <div className="flex items-end gap-2 mb-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] text-zinc-500 mb-1">السيرفر</label>
                <select
                  value={streamId}
                  onChange={(e) => setStreamId(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                >
                  {streams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.quality} · {s.serverName || 'بدون اسم'} {!s.isActive && '(معطّل)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[11px] text-zinc-500 mb-1">الترجمة</label>
                <select
                  value={subtitleId}
                  onChange={(e) => setSubtitleId(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-2 px-2.5 text-xs outline-none focus:border-zinc-600"
                >
                  <option value={NONE}>بدون ترجمة</option>
                  {subtitles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.language} · {s.format}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingSubtitle && (
              <p className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> جارٍ تحميل الترجمة...
              </p>
            )}
            {subtitleError && <p className="text-[11px] text-amber-400 mb-2">{subtitleError}</p>}
            {streamError && <p className="text-[11px] text-red-400 mb-2">{streamError}</p>}

            {stream && (
              <video
                ref={videoRef}
                key={`${stream.id}-${trackUrl ?? 'no-track'}`}
                controls
                className="w-full rounded-lg bg-black aspect-video mb-3"
              >
                {trackUrl && (
                  <track
                    kind="subtitles"
                    src={trackUrl}
                    default
                    label={subtitle?.language}
                    onLoad={() => applySync(offsetMs, speed)}
                  />
                )}
              </video>
            )}

            {subtitle && (
              <div className="bg-black border border-zinc-800 rounded-lg p-4">
                <h3 className="text-[11px] font-black text-zinc-400 mb-3">مزامنة الترجمة</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 w-14">التوقيت</span>
                    <button
                      type="button"
                      onClick={() => changeOffset(OFFSET_STEP_MS)}
                      className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 transition-colors"
                      title="تأخير"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-xs font-bold w-16 text-center" dir="ltr">
                      {(offsetMs / 1000).toFixed(2)}s
                    </span>
                    <button
                      type="button"
                      onClick={() => changeOffset(-OFFSET_STEP_MS)}
                      className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 transition-colors"
                      title="تقديم"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 w-14">السرعة</span>
                    <button
                      type="button"
                      onClick={() => changeSpeed(-SPEED_STEP)}
                      className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 transition-colors"
                      title="أبطأ"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-xs font-bold w-16 text-center" dir="ltr">
                      {(speed * 100).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => changeSpeed(SPEED_STEP)}
                      className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 transition-colors"
                      title="أسرع"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOffsetMs(0);
                      setSpeed(1);
                    }}
                    className="text-[11px] font-bold text-zinc-500 hover:text-white transition-colors"
                  >
                    إعادة تعيين
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveSync()}
                    className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {saving && <Loader2 size={12} className="animate-spin" />}
                    حفظ كافتراضي لكل المشاهدين
                  </button>
                </div>
                {saveMessage && <p className="text-[11px] text-emerald-400 mt-2">{saveMessage}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
