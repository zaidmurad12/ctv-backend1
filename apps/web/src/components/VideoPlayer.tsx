import type { SyntheticEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { continueWatchingService } from '../services/continueWatchingService';
import { historyService } from '../services/historyService';
import { CinemaDropdown } from './CinemaDropdown';
import { useLocale } from '../context/LocaleContext';
import type { StreamResponseDto, SubtitleResponseDto } from '../lib/types';

interface VideoPlayerProps {
  readonly movieId?: string;
  readonly episodeId?: string;
  readonly streams: readonly StreamResponseDto[];
  readonly subtitles: readonly SubtitleResponseDto[];
}

const PROGRESS_REPORT_INTERVAL_SECONDS = 10;
const OFF = 'off';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function VideoPlayer({ movieId, episodeId, streams, subtitles }: VideoPlayerProps) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReportedRef = useRef(0);

  const defaultStream = useMemo(
    () => streams.find((stream) => stream.isDefault) ?? streams[0],
    [streams],
  );
  const [activeStreamId, setActiveStreamId] = useState<string | undefined>(defaultStream?.id);
  const defaultSubtitle = useMemo(
    () => subtitles.find((subtitle) => subtitle.isDefault),
    [subtitles],
  );
  const [activeSubtitleId, setActiveSubtitleId] = useState<string>(defaultSubtitle?.id ?? OFF);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const activeStream = streams.find((stream) => stream.id === activeStreamId) ?? defaultStream;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i += 1) {
      const track = video.textTracks[i];
      const subtitle = subtitles[i];
      track.mode = subtitle && subtitle.id === activeSubtitleId ? 'showing' : 'hidden';
    }
  }, [activeSubtitleId, activeStreamId, subtitles]);

  if (!activeStream) {
    return (
      <p className="p-4 border border-dashed border-zinc-700 rounded-lg text-zinc-500">
        {t('player.noSource')}
      </p>
    );
  }

  function reportProgress(position: number) {
    void continueWatchingService.upsert({ movieId, episodeId, position: Math.floor(position) });
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const current = event.currentTarget.currentTime;
    setCurrentTime(current);
    if (current - lastReportedRef.current >= PROGRESS_REPORT_INTERVAL_SECONDS) {
      lastReportedRef.current = current;
      reportProgress(current);
    }
  }

  function handleEnded(event: SyntheticEvent<HTMLVideoElement>) {
    setIsPlaying(false);
    const total = Math.floor(event.currentTarget.duration || 0);
    void historyService.record({ movieId, episodeId, position: total, duration: total });
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen();
  }

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    video.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const serverOptions = streams.map((stream) => ({
    id: stream.id,
    label: `${stream.serverName} · ${stream.quality}`,
  }));
  const subtitleOptions = [
    { id: OFF, label: t('player.subtitlesOff') },
    ...subtitles.map((subtitle) => ({ id: subtitle.id, label: subtitle.language.toUpperCase() })),
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800"
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- tracks are provided below when available */}
      <video
        key={activeStream.id}
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain bg-black"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onClick={togglePlay}
      >
        <source src={activeStream.streamUrl} />
        {subtitles.map((subtitle) => (
          <track
            key={subtitle.id}
            kind="subtitles"
            src={subtitle.url}
            srcLang={subtitle.language}
            label={subtitle.language.toUpperCase()}
          />
        ))}
      </video>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-black/80 backdrop-blur-md p-4">
        <div
          className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="bg-white h-full shadow-[0_0_10px_white]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={togglePlay} className="p-2 rounded bg-white text-black">
              {isPlaying ? (
                <Pause size={16} className="fill-current" />
              ) : (
                <Play size={16} className="fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded bg-white/10 text-white hover:bg-white/20"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <span className="text-xs font-mono font-bold text-white">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {subtitles.length > 0 && (
              <CinemaDropdown
                label={t('player.subtitles')}
                options={subtitleOptions}
                selectedId={activeSubtitleId}
                onSelect={setActiveSubtitleId}
              />
            )}
            <CinemaDropdown
              label={t('player.server')}
              options={serverOptions}
              selectedId={activeStream.id}
              onSelect={setActiveStreamId}
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded bg-white/10 text-white hover:bg-white/20"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
