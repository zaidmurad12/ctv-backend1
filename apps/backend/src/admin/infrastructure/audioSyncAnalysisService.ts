import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';

interface TimeRange {
  startMs: number;
  endMs: number;
}

const WINDOW_DURATION_MS = 150000;
const MAX_SHIFT_MS = 60000;
const SAMPLE_RATE = 16000; // Plenty for speech-energy VAD, keeps the ffmpeg output small.
const FRAME_MS = 20;
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.18;

/**
 * The radical fix for "subtitle sync is always a mess" (reported repeatedly): every earlier fix
 * in this app - the manual offset stepper, the in-player audio-sync button, hash-matching - only
 * ever helped the *one viewer* who ran it, on their *one device*. This runs that same analysis
 * once, automatically, right after a subtitle is attached to a movie/episode (see this service's
 * call sites in adminMoviesRepository.ts/adminShowsRepository.ts), and stores the result as that
 * Subtitle row's own default - every future viewer gets a correctly-synced subtitle from the
 * first frame, with nobody needing to notice a problem or press anything.
 *
 * Same algorithm as the client-side version (AudioSyncModule.kt's VAD, audioSync.ts's
 * correlation), ported to run here against ffmpeg instead of MediaCodec: decode two ~150s
 * windows of audio at two points well apart in the file, flag speech via a whole-window
 * percentile noise floor (not a running one - see AudioSyncModule.kt's own comment on why that
 * matters), correlate each against the subtitle's own cue timings, and fit an offset+speed from
 * how those two points disagree.
 */
@Injectable()
export class AudioSyncAnalysisService {
  private readonly logger = new Logger(AudioSyncAnalysisService.name);
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  /** Fire-and-forget from a request handler - never awaited by the caller, updates the row when it finishes. */
  analyzeInBackground(subtitleId: string, streamUrl: string, subtitleContent: string): void {
    this.analyze(subtitleId, streamUrl, subtitleContent).catch((err) => {
      this.logger.warn(
        `Sync analysis crashed for subtitle "${subtitleId}": ${(err as Error).message}`,
      );
      this.prisma.subtitle
        .update({ where: { id: subtitleId }, data: { syncAnalysisStatus: 'failed' } })
        .catch(() => {});
    });
  }

  private async analyze(
    subtitleId: string,
    streamUrl: string,
    subtitleContent: string,
  ): Promise<void> {
    const cues = parseCues(subtitleContent);
    if (cues.length < 5) {
      await this.prisma.subtitle.update({
        where: { id: subtitleId },
        data: { syncAnalysisStatus: 'failed' },
      });
      return;
    }

    const durationMs = await probeDurationMs(streamUrl);
    const t1 = 60000; // A minute in - skips cold-open silence/studio logos most titles start with.
    let t2: number | null = null;
    if (durationMs && durationMs > 0) {
      const latestStart = durationMs - WINDOW_DURATION_MS - 5000;
      if (latestStart > t1 + 5 * 60 * 1000) t2 = Math.min(t1 + 15 * 60 * 1000, latestStart);
    } else {
      t2 = t1 + 15 * 60 * 1000;
    }

    const offset1 = await this.measureAt(streamUrl, cues, t1);
    if (offset1 == null) {
      await this.prisma.subtitle.update({
        where: { id: subtitleId },
        data: { syncAnalysisStatus: 'failed' },
      });
      return;
    }

    let finalOffsetMs = Math.max(-MAX_SHIFT_MS, Math.min(MAX_SHIFT_MS, offset1));
    let finalSpeed = 1;
    if (t2 != null) {
      const offset2 = await this.measureAt(streamUrl, cues, t2);
      if (offset2 != null) {
        const elapsedMs = t2 - t1;
        const driftMs = offset2 - offset1;
        if (elapsedMs > 60000 && Math.abs(elapsedMs - driftMs) > 500) {
          const fittedSpeed = elapsedMs / (elapsedMs - driftMs);
          if (fittedSpeed > MIN_SPEED && fittedSpeed < MAX_SPEED) {
            finalSpeed = fittedSpeed;
            finalOffsetMs = t1 - fittedSpeed * (t1 - offset1);
          }
        }
      }
    }

    await this.prisma.subtitle.update({
      where: { id: subtitleId },
      data: {
        defaultOffsetMs: Math.round(finalOffsetMs),
        defaultSpeed: finalSpeed,
        syncAnalysisStatus: 'done',
      },
    });
    this.logger.log(
      `Sync analysis for subtitle "${subtitleId}": offset=${Math.round(finalOffsetMs)}ms speed=${finalSpeed.toFixed(4)}`,
    );
  }

  private async measureAt(
    streamUrl: string,
    cues: TimeRange[],
    windowStartMs: number,
  ): Promise<number | null> {
    try {
      const pcm = await extractPcm(streamUrl, windowStartMs, WINDOW_DURATION_MS);
      const segments = detectSpeechSegments(pcm, windowStartMs);
      return detectSyncOffsetMs(segments, cues, windowStartMs, WINDOW_DURATION_MS);
    } catch (err) {
      this.logger.warn(`measureAt(${windowStartMs}) failed: ${(err as Error).message}`);
      return null;
    }
  }
}

// --- Subtitle cue parsing (SRT/VTT) - a server-side twin of the app's own vtt.ts, since this
// needs to run here rather than ship the parsed cues over from the client. ---
function parseCues(raw: string): TimeRange[] {
  const cues: TimeRange[] = [];
  const blocks = raw.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    const timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((s) => s.trim().split(' ')[0]);
    const start = timeToMs(startRaw);
    const end = timeToMs(endRaw);
    if (Number.isFinite(start) && Number.isFinite(end)) cues.push({ startMs: start, endMs: end });
  }
  return cues;
}

function timeToMs(t: string): number {
  const parts = t.trim().split(':');
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + parseFloat(p.replace(',', '.'));
  return seconds * 1000;
}

// --- ffmpeg/ffprobe process helpers ---

function probeDurationMs(streamUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      streamUrl,
    ];
    const proc = spawn('ffprobe', args, { timeout: 15000 });
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const seconds = parseFloat(out.trim());
      resolve(Number.isFinite(seconds) ? seconds * 1000 : null);
    });
  });
}

// Raw mono 16-bit PCM for a `durationMs` window starting at `startMs`, decoded straight off the
// same streaming URL react-native-video plays - never the whole file, just this one window per
// call, same reasoning as AudioSyncModule.kt's own comment.
function extractPcm(streamUrl: string, startMs: number, durationMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-ss',
      String(startMs / 1000),
      '-t',
      String(durationMs / 1000),
      '-i',
      streamUrl,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-f',
      's16le',
      'pipe:1',
    ];
    const proc = spawn('ffmpeg', args, { timeout: 60000 });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (chunks.length === 0) {
        reject(new Error(`ffmpeg produced no audio (exit ${code})`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

// --- VAD: same percentile-noise-floor approach as AudioSyncModule.kt (see its own comment for
// why a *running* floor fails on a window that's continuous, fairly uniform dialogue). ---
function detectSpeechSegments(pcm: Buffer, windowStartMs: number): TimeRange[] {
  const frameSamples = Math.floor((SAMPLE_RATE * FRAME_MS) / 1000);
  const frameBytes = frameSamples * 2; // 16-bit samples
  const frameCount = Math.floor(pcm.length / frameBytes);
  if (frameCount === 0) return [];

  const dbs: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sumSquares = 0;
    const base = f * frameBytes;
    for (let i = 0; i < frameSamples; i++) {
      const sample = pcm.readInt16LE(base + i * 2);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / frameSamples);
    dbs[f] = rms > 1 ? 20 * Math.log10(rms) : -100;
  }

  const sorted = [...dbs].sort((a, b) => a - b);
  const noiseFloorDb = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2))];
  const threshold = noiseFloorDb + 10;

  const segments: TimeRange[] = [];
  let speechActive = false;
  let speechStartMs = 0;
  for (let f = 0; f < frameCount; f++) {
    const frameTimeMs = windowStartMs + f * FRAME_MS;
    const isSpeech = dbs[f] > threshold;
    if (isSpeech && !speechActive) {
      speechActive = true;
      speechStartMs = frameTimeMs;
    } else if (!isSpeech && speechActive) {
      speechActive = false;
      segments.push({ startMs: speechStartMs, endMs: frameTimeMs });
    }
  }
  if (speechActive)
    segments.push({ startMs: speechStartMs, endMs: windowStartMs + frameCount * FRAME_MS });
  return segments;
}

// --- Correlation: a direct port of audioSync.ts's detectSyncOffsetMs (Jaccard overlap +
// second-peak-margin check - see its own comment for why a raw intersection count wasn't enough
// to tell a genuine sync match from a coincidental one). ---
function buildSignal(
  ranges: TimeRange[],
  rangeStart: number,
  rangeEnd: number,
  stepMs: number,
): Uint8Array {
  const length = Math.max(0, Math.ceil((rangeEnd - rangeStart) / stepMs));
  const signal = new Uint8Array(length);
  for (const r of ranges) {
    const from = Math.max(0, Math.floor((r.startMs - rangeStart) / stepMs));
    const to = Math.min(length, Math.ceil((r.endMs - rangeStart) / stepMs));
    for (let i = from; i < to; i++) signal[i] = 1;
  }
  return signal;
}

function overlapScore(subSignal: Uint8Array, audioSignal: Uint8Array, shift: number): number {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < subSignal.length; i++) {
    const j = i + shift;
    const a = subSignal[i] === 1;
    const b = j >= 0 && j < audioSignal.length && audioSignal[j] === 1;
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return union === 0 ? 0 : intersection / union;
}

function detectSyncOffsetMs(
  speechSegments: TimeRange[],
  subtitleCuesMs: TimeRange[],
  windowStartMs: number,
  windowDurationMs: number,
  maxShiftMs = MAX_SHIFT_MS,
  stepMs = 100,
): number | null {
  const rangeStart = windowStartMs - maxShiftMs;
  const rangeEnd = windowStartMs + windowDurationMs + maxShiftMs;
  const audioSignal = buildSignal(speechSegments, rangeStart, rangeEnd, stepMs);
  const subSignal = buildSignal(subtitleCuesMs, rangeStart, rangeEnd, stepMs);

  let audioActiveCount = 0;
  for (const v of audioSignal) audioActiveCount += v;
  let subActiveCount = 0;
  for (const v of subSignal) subActiveCount += v;
  if (audioActiveCount < 30 || subActiveCount < 30) return null;

  const maxShiftSteps = Math.floor(maxShiftMs / stepMs);
  const scores: number[] = [];
  let bestShift = 0;
  let bestScore = -1;
  for (let shift = -maxShiftSteps; shift <= maxShiftSteps; shift++) {
    const score = overlapScore(subSignal, audioSignal, shift);
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  let secondBestScore = 0;
  for (let i = 0; i < scores.length; i++) {
    const shift = i - maxShiftSteps;
    if (Math.abs(shift - bestShift) * stepMs < 1000) continue;
    if (scores[i] > secondBestScore) secondBestScore = scores[i];
  }

  if (bestScore < 0.35) return null;
  if (secondBestScore > bestScore * 0.85) return null;

  return bestShift * stepMs;
}
