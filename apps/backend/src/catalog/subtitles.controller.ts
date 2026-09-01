import {
  BadGatewayException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';
import { OpenSubtitlesService } from '../admin/infrastructure/openSubtitlesService.js';

// Public like movies/shows/episodes - the app calls this URL directly during playback (see
// Subtitle.externalFileId's own comment in schema.prisma for why this indirection exists at
// all instead of a plain stored link).
@ApiTags('subtitles')
@Controller('subtitles')
export class SubtitlesController {
  private readonly prisma: PrismaDatabaseClient;
  private readonly logger = new Logger(SubtitlesController.name);

  constructor(
    prismaService: PrismaService,
    private readonly openSubtitles: OpenSubtitlesService,
  ) {
    this.prisma = prismaService.client;
  }

  @Public()
  @Get(':id/resolve')
  @ApiOperation({ summary: 'Resolves a subtitle and streams its real content back' })
  async resolve(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const subtitle = await this.prisma.subtitle.findUnique({
      where: { id },
      select: { url: true, externalFileId: true, resolvedUrl: true, resolvedContent: true },
    });
    if (!subtitle) throw new NotFoundException(`Subtitle "${id}" not found.`);

    // Already have the real bytes on file - serve them straight from the database and never
    // touch OpenSubtitles again for this row. See Subtitle.resolvedContent's own comment: this
    // is what makes each externalFileId cost the (tiny, single-digits-per-day) download quota
    // exactly once for its entire lifetime instead of once per cache window.
    if (subtitle.resolvedContent) {
      this.serveContent(res, subtitle.resolvedContent);
      return;
    }

    // Manually admin-added subtitles (externalFileId null) store a real link directly in `url` -
    // nothing to resolve, just fetch and forward it. Not cached in resolvedContent since these
    // aren't OpenSubtitles-quota-limited and an admin may swap `url` later.
    if (!subtitle.externalFileId) {
      const content = await this.fetchText(subtitle.url);
      if (content !== null) {
        this.serveContent(res, content);
        return;
      }
      this.logger.warn(`Could not fetch subtitle "${id}" from its direct url.`);
      throw new BadGatewayException(`Could not fetch subtitle "${id}" from its source.`);
    }

    const freshLink = await this.openSubtitles.resolveDownloadLink(subtitle.externalFileId);
    if (freshLink) {
      const content = await this.fetchText(freshLink);
      if (content !== null) {
        await this.prisma.subtitle.update({
          where: { id },
          data: { resolvedUrl: freshLink, resolvedContent: content },
        });
        this.serveContent(res, content);
        return;
      }
      this.logger.warn(
        `Resolved a fresh OpenSubtitles link for "${id}" but failed to fetch its content.`,
      );
    } else {
      this.logger.warn(
        `OpenSubtitles resolveDownloadLink returned nothing for "${id}" (externalFileId ${subtitle.externalFileId}) - likely the daily download quota is exhausted.`,
      );
    }

    // A failed re-resolve (quota exhausted, OpenSubtitles hiccup) used to fall back to
    // `subtitle.url`, which for an OpenSubtitles-backed row *is this same endpoint* - an
    // infinite self-redirect that silently broke every subtitle whenever the quota ran out.
    // Falling back to the last resolved link (even though it may itself have since expired) at
    // least attempts something real instead of giving up immediately.
    if (subtitle.resolvedUrl) {
      const content = await this.fetchText(subtitle.resolvedUrl);
      if (content !== null) {
        this.serveContent(res, content);
        return;
      }
    }
    throw new BadGatewayException(`Could not resolve a playable subtitle for "${id}".`);
  }

  private serveContent(res: Response, body: string): void {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(body);
  }

  /**
   * Fetches `url` and returns its body as text, or null on any failure. Proxying through this
   * server (rather than redirecting the device straight to the source) is deliberate: confirmed
   * on a real device (debug overlay: "ERROR: Network request failed") that the app's own network
   * can reach this backend's Cloud Run domain fine but fails outright to reach
   * opensubtitles.com - some networks block or can't resolve that host even though it's a
   * legitimate service, unrelated to this app's own CDN. Cloud Run's own outbound connection to
   * opensubtitles.com is unaffected by whatever the viewer's local network can or can't reach.
   */
  private async fetchText(url: string): Promise<string | null> {
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) return null;
      return await upstream.text();
    } catch {
      return null;
    }
  }
}
