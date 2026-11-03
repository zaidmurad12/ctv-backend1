import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/decorators.js';

const M3U8_EXTENSION = /\.m3u8(\?|$)/i;
const M3U8_CONTENT_TYPE = /mpegurl/i;

// A bare Node fetch (default User-Agent "node", no Referer/Accept at all) reads to a lot of CDNs
// as a bot/script rather than a real player, and some of these source servers reject exactly that
// - the same URL playing fine in the app (ExoPlayer, a real device) but failing only through this
// proxy is the signature of that, not a CORS problem (this endpoint already sidesteps CORS by
// existing at all). Referer is set to the target's own origin specifically because hotlink
// protection commonly checks for "the page embedding this asset is on my own site" - a generic
// browser UA alone doesn't satisfy that check on its own.
const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

// A playlist line's own URI is always relative to the playlist that referenced it, not to the
// original stream URL the browser first asked for - resolving against `base` (the URL actually
// just fetched) is what keeps a multi-level playlist (a master .m3u8 pointing at per-quality
// sub-playlists, which in turn point at .ts segments) rewriting correctly at every level instead
// of only the first one.
function toProxyUrl(rawUri: string, base: URL): string {
  const absolute = new URL(rawUri, base).toString();
  return `/api/v1/admin/stream-proxy?url=${encodeURIComponent(absolute)}`;
}

// Every line that isn't a comment/tag is itself a URI (the next segment, or a nested playlist) -
// and an #EXT-X-KEY/#EXT-X-MAP tag's own URI="..." attribute (AES-128 key files, init segments)
// needs the same treatment, or an encrypted stream fails even once the segments themselves load.
function rewritePlaylist(text: string, base: URL): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/, (_m, uri: string) => `URI="${toProxyUrl(uri, base)}"`);
      }
      return toProxyUrl(trimmed, base);
    })
    .join('\n');
}

/**
 * Preview-only proxy for the admin dashboard's PreviewModal (see its own comment on why hls.js
 * is needed at all there). hls.js issues real XHR/fetch requests for the manifest and every
 * segment, which - unlike react-native-video's native ExoPlayer playback in the app, and unlike
 * Safari's own OS-level HLS player - *are* subject to the browser's CORS policy. The source CDNs
 * these streams come from have no reason to send an Access-Control-Allow-Origin header for an
 * arbitrary third-party admin dashboard, so hls.js's own requests were silently blocked - reported
 * as "some links don't work in the control panel [but load fine in the app]". Fetching server-side
 * and handing the bytes back from this backend's own origin sidesteps that entirely, the same
 * reasoning SubtitlesController.resolve already uses for subtitle files.
 */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/stream-proxy')
export class StreamProxyController {
  private readonly logger = new Logger(StreamProxyController.name);

  @Get()
  @ApiOperation({ summary: 'Proxies an HLS manifest or segment for the admin preview player' })
  async proxy(@Query('url') rawUrl: string | undefined, @Res() res: Response): Promise<void> {
    if (!rawUrl) throw new BadRequestException('Missing "url" query parameter.');

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      throw new BadRequestException('"url" is not a valid absolute URL.');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new BadRequestException('Only http(s) URLs can be proxied.');
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(target.toString(), {
        signal: AbortSignal.timeout(15000),
        headers: { ...UPSTREAM_HEADERS, Referer: `${target.origin}/` },
      });
    } catch (err) {
      this.logger.warn(`Network error proxying "${target.toString()}": ${String(err)}`);
      throw new BadGatewayException('Could not reach the upstream stream.');
    }
    if (!upstream.ok) {
      // A short body snippet, not just the status - some of these servers return a real HTML
      // "blocked"/"forbidden" page with a 200 (not 403), which a status-only log can't tell apart
      // from a legitimately empty/successful response.
      const snippet = await upstream
        .clone()
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => '<unreadable>');
      this.logger.warn(`Upstream "${target.toString()}" responded ${upstream.status}: ${snippet}`);
      throw new BadGatewayException(`Upstream responded with ${upstream.status}.`);
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    // Segments/keys are small (a few seconds of video, at most a few MB) - buffering the whole
    // thing is far simpler than piping a web ReadableStream through an Express response, and at
    // this size costs nothing meaningful in memory or latency. Read once regardless of what it
    // turns out to be, rather than committing to .text() vs .arrayBuffer() before knowing.
    const buffer = Buffer.from(await upstream.arrayBuffer());

    // The URL/content-type checks miss some real playlists outright - a CDN can serve one behind
    // an opaque, tokenized path with no ".m3u8" anywhere in it and a generic or absent content-
    // type (reported as "this link still doesn't work," traced to exactly that: a genuinely-HLS
    // stream this pair of checks both failed to recognize as one). "#EXTM3U" is the format's own
    // required first line - checking the actual bytes is the one signal that can't be spoofed by
    // an unhelpful URL or header, so it's the deciding check whenever the other two don't already
    // agree it's a playlist.
    const isPlaylist =
      M3U8_EXTENSION.test(target.pathname) ||
      M3U8_CONTENT_TYPE.test(contentType) ||
      buffer.subarray(0, 32).toString('utf8').trimStart().startsWith('#EXTM3U');

    res.setHeader('Cache-Control', 'no-store');
    if (isPlaylist) {
      const rewritten = rewritePlaylist(buffer.toString('utf8'), target);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.status(200).send(rewritten);
      return;
    }

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.status(200).send(buffer);
  }
}
