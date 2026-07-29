import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import type { ReconcileSummary, SubtitleInput, SubtitlePort } from './ports.js';

/**
 * Unlike `Stream`, the `Subtitle` table has no `isActive` column, so there is
 * no deactivation concept here — per specification/06-Cinemana-Reverse-
 * Engineering.md.txt ("Existing subtitles are updated only when changed"),
 * subtitles no longer discovered are simply left untouched. `url` is the
 * natural identity within a given movie/episode link, mirroring the stream
 * repository's approach to the same schema limitation.
 */
export class PrismaSubtitleRepository implements SubtitlePort {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async reconcileForMovieLink(
    movieProviderId: string,
    subtitles: readonly SubtitleInput[],
  ): Promise<ReconcileSummary> {
    const existing = await this.prisma.subtitle.findMany({ where: { movieProviderId } });
    return this.reconcile(existing, subtitles, (data) =>
      this.prisma.subtitle.create({ data: { movieProviderId, ...data } }),
    );
  }

  async reconcileForEpisodeLink(
    episodeProviderId: string,
    subtitles: readonly SubtitleInput[],
  ): Promise<ReconcileSummary> {
    const existing = await this.prisma.subtitle.findMany({ where: { episodeProviderId } });
    return this.reconcile(existing, subtitles, (data) =>
      this.prisma.subtitle.create({ data: { episodeProviderId, ...data } }),
    );
  }

  private async reconcile(
    existing: Array<{ id: string; url: string }>,
    incoming: readonly SubtitleInput[],
    create: (data: {
      language: string;
      format: string;
      url: string;
      isDefault: boolean;
    }) => Promise<unknown>,
  ): Promise<ReconcileSummary> {
    const existingByUrl = new Map(existing.map((row) => [row.url, row]));

    let created = 0;
    let updated = 0;

    for (const subtitle of incoming) {
      const match = existingByUrl.get(subtitle.downloadUrl);
      if (match) {
        await this.prisma.subtitle.update({
          where: { id: match.id },
          data: {
            language: subtitle.language,
            format: subtitle.format,
            isDefault: subtitle.isDefault,
          },
        });
        updated += 1;
      } else {
        await create({
          language: subtitle.language,
          format: subtitle.format,
          url: subtitle.downloadUrl,
          isDefault: subtitle.isDefault,
        });
        created += 1;
      }
    }

    return { created, updated, deactivated: 0 };
  }
}
