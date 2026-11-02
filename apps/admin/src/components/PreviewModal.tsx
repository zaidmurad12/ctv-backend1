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

// Streams/subtitles handed in by SourcePreview (fetched live from CEE/Cinemana, not stored in our
// database) carry ids starting with this prefix - they play straight from the source and can't be
// saved back as a default sync (there's no Subtitle row to update).
const SOURCE_ID_PREFIX = 'src:';
const isSourceId = (id: string | undefined): boolean => !!id && id.startsWith(SOURCE_ID_PREFIX);
const isHlsUrl = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

// A source's subtitle host usually doesn't send CORS headers for this dashboard's origin either, so
// a direct fetch can fail even though the file is fine - the admin's own stream-proxy (bearer-
// authenticated, same one hls.js goes through) is the fallback.
async function fetchSubtitleText(url: string, allowProxyFallback: boolean): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (!allowProxyFallback) throw err;
    const token = tokenStorage.getAccessToken();
    const res = await fetch(proxiedStreamUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
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
  // Added for the YouTube preview path below (see its own comment) - a YouTube iframe has no
  // native <track>/TextTrack support to render cue text for us the way the plain <video> path
  // relies on, so that path needs the actual words, not just timing, to draw its own overlay.
  // The native <video> path still only ever reads start/end (see applySync) - this rides along
  // unused there, one parse instead of two slightly-different ones.
  readonly text: string;
}

// WebVTT timestamps are "HH:MM:SS.mmm" or "MM:SS.mmm" - both appear in the wild depending on
// what produced the file. Parses whichever form each cue uses into plain seconds.
function parseVttTimestamp(raw: string): number {
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(raw) || 0;
}

// Non-global twin of the timing-line pattern - .test() on a `g`-flagged regex is stateful
// (advances lastIndex across calls), which would silently break the per-block scan below the
// second time it ran; kept separate rather than resetting lastIndex defensively every call.
const CUE_LINE_TEST = /(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/;

// WebVTT cue blocks are separated by a blank line, each with an optional identifier line, one
// timing line, then the cue's own text on however many lines follow until the next blank line.
function parseCues(vtt: string): CueTime[] {
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/);
  const cues: CueTime[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((l) => CUE_LINE_TEST.test(l));
    if (timingIndex === -1) continue;
    const [startRaw, endRaw] = lines[timingIndex].split('-->').map((s) => s.trim().split(' ')[0]);
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (!text) continue;
    cues.push({ start: parseVttTimestamp(startRaw), end: parseVttTimestamp(endRaw), text });
  }
  return cues;
}

// See CueTime's own comment - the YouTube preview path's replacement for the native <video>
// path's applySync (which rewrites real TextTrackCue objects the browser then renders itself).
// Re-derives each cue's *current* start/end from its original (unshifted) position and whatever
// offset/speed the steppers are showing right now, exactly like applySync's own formula, since
// there's no persistent cue object here to mutate in place - this runs fresh on every polled tick.
function activeCueText(cues: readonly CueTime[], time: number, offsetMs: number, speed: number): string | null {
  const offsetSec = offsetMs / 1000;
  for (const cue of cues) {
    const start = cue.start * speed + offsetSec;
    const end = cue.end * speed + offsetSec;
    if (time >= start && time <= end) return cue.text;
  }
  return null;
}

// Same regex shape the RN TV app's own api.ts:youtubeVideoId uses - kept in lockstep so a link
// the app recognizes as YouTube is recognized here too, and vice versa.
function youtubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Loaded at most once per page load, not once per modal open/close - re-injecting this script
// tag every time the modal reopens would eventually register the iframe API's own global ready
// callback multiple times over.
let youtubeApiPromise: Promise<void> | null = null;
function loadYoutubeApi(): Promise<void> {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    });
  }
  return youtubeApiPromise;
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
  // Admin-entered per explicit request: a stream URL that's a YouTube link (rather than a direct
  // video file) plays through YouTube's own official embed instead of the <video>/hls.js path
  // above, which has no way to play a YouTube page at all - mirrors the same detection the RN TV
  // app already does for the exact same reason.
  const youtubeId = useMemo(() => (stream ? youtubeVideoId(stream.streamUrl) : null), [stream]);

  // YouTube's own native controls stay on here (unlike the TV app's own player) - this is an
  // admin tool for checking subtitle timing, not the end-user product, so there's no reason to
  // rebuild play/pause/seek UI just to hide YouTube's branding. All this needs is the *current
  // playback time*, polled from the iframe, to know which cue to draw in the overlay below -
  // whatever native control the admin used to get there (play, pause, dragging YouTube's own
  // seek bar) already moves this the same way.
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  useEffect(() => {
    if (!youtubeId) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    // A mount node YT.Player itself creates (not the React-managed ref div above) - the IFrame API
    // replaces whatever element it's given with its own <iframe>, outside React's knowledge; handing
    // it a node React is still tracking risks React later trying to reconcile/remove a node that's
    // no longer there (a "removeChild" crash) or the API's own DOM surgery landing before React has
    // actually committed the ref's element (so nothing visibly attaches). Appending a plain child
    // that React never touches again after this effect sidesteps both.
    const mountNode = document.createElement('div');
    mountNode.style.width = '100%';
    mountNode.style.height = '100%';
    ytContainerRef.current?.appendChild(mountNode);
    loadYoutubeApi().then(() => {
      if (cancelled) return;
      const player = new (window as any).YT.Player(mountNode, {
        width: '100%',
        height: '100%',
        videoId: youtubeId,
        playerVars: { modestbranding: 1, rel: 0, iv_load_policy: 3 },
        events: {
          onReady: () => {
            interval = setInterval(() => {
              setYtCurrentTime(player.getCurrentTime?.() ?? 0);
            }, 200);
          },
        },
      });
      ytPlayerRef.current = player;
    });
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = null;
      mountNode.remove();
      setYtCurrentTime(0);
    };
  }, [youtubeId]);

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

    // A source's plain (non-HLS) video file needs neither hls.js nor the proxy - the browser plays a
    // direct URL as-is (playback isn't subject to CORS the way hls.js's own requests are).
    if (isSourceId(stream.id) && !isHlsUrl(stream.streamUrl)) {
      video.src = stream.streamUrl;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

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
    fetchSubtitleText(subtitle.url, isSourceId(subtitle.id))
      .then((text) => {
        if (cancelled) return;
        const vtt = isVtt(subtitle.format, text) ? text : srtToVtt(text);
        originalCuesRef.current = parseCues(vtt);
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
    if (!subtitle || isSourceId(subtitle.id)) return;
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
          <h2 className="text-sm font-black">
            {isSourceId(streams[0]?.id) ? 'معاينة من المصدر' : 'معاينة'} — {title}
          </h2>
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

            {stream && youtubeId && (
              // YouTube source: the native <video>/hls.js path doesn't apply, so this preview
              // embeds the actual YouTube IFrame player (its own controls left on - this is an
              // admin QA view for checking sync, not the end-user player) and draws our own
              // subtitle line on top from the parsed VTT, driven by polling getCurrentTime().
              <div className="relative w-full rounded-lg bg-black aspect-video mb-3 overflow-hidden">
                <div ref={ytContainerRef} className="absolute inset-0 w-full h-full" />
                {(() => {
                  const cueText = activeCueText(originalCuesRef.current, ytCurrentTime, offsetMs, speed);
                  return cueText ? (
                    <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center px-6">
                      <span className="bg-black/70 text-white text-sm leading-snug px-3 py-1 rounded text-center whitespace-pre-line">
                        {cueText}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {stream && !youtubeId && (
              // key was `${stream.id}-${trackUrl ?? 'no-track'}` - including trackUrl meant
              // picking a subtitle (trackUrl going from null to a real blob URL) forced React to
              // tear down this whole element and mount a brand new one, but the hls.js instance
              // attached to the *old* one (see the effect above, keyed only on stream.id/
              // streamUrl - it never re-ran) had no idea its video element had just been replaced
              // out from under it - reported as "the video stops when I turn subtitles on." The
              // <track> child below already updates in place when trackUrl changes on its own;
              // nothing here needed the parent <video> to remount for that at all.
              <video
                ref={videoRef}
                key={stream.id}
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
                    disabled={saving || isSourceId(subtitle.id)}
                    title={isSourceId(subtitle.id) ? 'ترجمة من المصدر - لا يمكن حفظ المزامنة لها' : undefined}
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
