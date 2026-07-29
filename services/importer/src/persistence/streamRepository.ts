import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import type { ReconcileSummary, StreamInput, StreamPort } from './ports.js';

/**
 * The `Stream` table has no column for the provider's own stream id, so
 * `streamUrl` is treated as the natural identity within a given movie/
 * episode link. Per specification/06-Cinemana-Reverse-Engineering.md.txt
 * ("Streams must never overwrite each other. Inactive streams remain
 * stored."), streams that disappear from a re-scan are marked inactive
 * rather than deleted, and previously-seen URLs are updated in place rather
 * than duplicated.
 */
export class PrismaStreamRepository implements StreamPort {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async reconcileForMovieLink(
    movieProviderId: string,
    streams: readonly StreamInput[],
  ): Promise<ReconcileSummary> {
    const existing = await this.prisma.stream.findMany({ where: { movieProviderId } });
    return this.reconcile(existing, streams, (data) =>
      this.prisma.stream.create({ data: { movieProviderId, ...data } }),
    );
  }

  async reconcileForEpisodeLink(
    episodeProviderId: string,
    streams: readonly StreamInput[],
  ): Promise<ReconcileSummary> {
    const existing = await this.prisma.stream.findMany({ where: { episodeProviderId } });
    return this.reconcile(existing, streams, (data) =>
      this.prisma.stream.create({ data: { episodeProviderId, ...data } }),
    );
  }

  private async reconcile(
    existing: Array<{ id: string; streamUrl: string; isActive: boolean }>,
    incoming: readonly StreamInput[],
    create: (data: {
      quality: string;
      serverName: string;
      streamUrl: string;
      codec: string | null;
      language: string | null;
      isDefault: boolean;
      isActive: boolean;
    }) => Promise<unknown>,
  ): Promise<ReconcileSummary> {
    const existingByUrl = new Map(existing.map((row) => [row.streamUrl, row]));
    const incomingUrls = new Set(incoming.map((stream) => stream.playbackUrl));

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    for (const stream of incoming) {
      const match = existingByUrl.get(stream.playbackUrl);
      if (match) {
        await this.prisma.stream.update({
          where: { id: match.id },
          data: {
            quality: stream.quality,
            serverName: stream.serverName,
            codec: stream.codec ?? null,
            language: stream.language ?? null,
            isDefault: stream.isDefault,
            isActive: true,
          },
        });
        updated += 1;
      } else {
        await create({
          quality: stream.quality,
          serverName: stream.serverName,
          streamUrl: stream.playbackUrl,
          codec: stream.codec ?? null,
          language: stream.language ?? null,
          isDefault: stream.isDefault,
          isActive: true,
        });
        created += 1;
      }
    }

    for (const row of existing) {
      if (row.isActive && !incomingUrls.has(row.streamUrl)) {
        await this.prisma.stream.update({ where: { id: row.id }, data: { isActive: false } });
        deactivated += 1;
      }
    }

    return { created, updated, deactivated };
  }
}
