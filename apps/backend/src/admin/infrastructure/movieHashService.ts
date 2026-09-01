import { Injectable, Logger } from '@nestjs/common';

const CHUNK_SIZE = 65536; // 64KB
const MASK_64 = (1n << 64n) - 1n;

// OpenSubtitles' own "OSDb hash" (https://trac.opensubtitles.org/projects/opensubtitles/wiki/HashSourceCodes)
// - a 64-bit value built from the file's size plus the first and last 64KB of its own bytes,
// summed as 64-bit little-endian words with 64-bit wraparound. Deliberately cheap: two small
// ranged HTTP fetches (128KB total) against the same CDN URL react-native-video already streams
// from, never the whole file, and no audio decoding at all - this identifies the exact release
// byte-for-byte, which OpenSubtitles can match against a subtitle already timed for that same
// file, when one exists (see openSubtitlesService.ts's own searchByHash).
@Injectable()
export class MovieHashService {
  private readonly logger = new Logger(MovieHashService.name);

  async computeHash(url: string): Promise<string | null> {
    try {
      const first = await this.fetchRange(url, 0, CHUNK_SIZE - 1);
      if (!first) return null;
      const fileSize = first.totalSize;
      if (fileSize < CHUNK_SIZE * 2) {
        // OSDb hash is only defined for files at least 128KB - never true for a real video file,
        // but a broken/redirect-only URL could report an implausibly small size.
        return null;
      }
      const last = await this.fetchRange(url, fileSize - CHUNK_SIZE, fileSize - 1);
      if (!last) return null;

      let sum = BigInt(fileSize) & MASK_64;
      sum = (sum + this.sumAsUint64Words(first.buffer)) & MASK_64;
      sum = (sum + this.sumAsUint64Words(last.buffer)) & MASK_64;
      return sum.toString(16).padStart(16, '0');
    } catch (err) {
      this.logger.warn(`computeHash failed for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  private sumAsUint64Words(buffer: Buffer): bigint {
    let sum = 0n;
    for (let offset = 0; offset + 8 <= buffer.length; offset += 8) {
      sum = (sum + buffer.readBigUInt64LE(offset)) & MASK_64;
    }
    return sum;
  }

  private async fetchRange(
    url: string,
    start: number,
    end: number,
  ): Promise<{ buffer: Buffer; totalSize: number } | null> {
    const res = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(15000),
    });
    // A server that ignores Range and returns the whole file (200, not 206) can't be trusted to
    // have sent back only the requested slice - safer to bail than hash the wrong bytes.
    if (res.status !== 206) return null;
    const contentRange = res.headers.get('content-range'); // "bytes 0-65535/123456789"
    const totalSize = contentRange ? Number(contentRange.split('/')[1]) : NaN;
    if (!Number.isFinite(totalSize) || totalSize <= 0) return null;
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), totalSize };
  }
}
