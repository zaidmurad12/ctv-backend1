import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import type { ArtworkInput, ArtworkKind, ArtworkPort, ReconcileSummary } from './ports.js';

const ARTWORK_KIND_TO_IMAGE_TYPE: Record<
  ArtworkKind,
  'POSTER' | 'BACKDROP' | 'LOGO' | 'THUMBNAIL' | 'STILL'
> = {
  poster: 'POSTER',
  backdrop: 'BACKDROP',
  logo: 'LOGO',
  thumbnail: 'THUMBNAIL',
  still: 'STILL',
};

/**
 * Each artwork kind is treated as a single evolving slot per movie/show, per
 * specification/07-TMDB-Integration.md.txt ("TMDB artwork replaces Provider
 * artwork whenever available"): the row for a given (content, type) is
 * updated in place rather than accumulated.
 */
export class PrismaImageRepository implements ArtworkPort {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async reconcileForMovie(
    movieId: string,
    artwork: readonly ArtworkInput[],
  ): Promise<ReconcileSummary> {
    return this.reconcile(
      artwork,
      (type) => this.prisma.image.findFirst({ where: { movieId, type } }),
      (data) => this.prisma.image.create({ data: { movieId, ...data } }),
    );
  }

  async reconcileForShow(
    showId: string,
    artwork: readonly ArtworkInput[],
  ): Promise<ReconcileSummary> {
    return this.reconcile(
      artwork,
      (type) => this.prisma.image.findFirst({ where: { showId, type } }),
      (data) => this.prisma.image.create({ data: { showId, ...data } }),
    );
  }

  private async reconcile(
    artwork: readonly ArtworkInput[],
    findExisting: (
      type: 'POSTER' | 'BACKDROP' | 'LOGO' | 'THUMBNAIL' | 'STILL',
    ) => Promise<{ id: string } | null>,
    create: (data: {
      type: 'POSTER' | 'BACKDROP' | 'LOGO' | 'THUMBNAIL' | 'STILL';
      url: string;
      provider: string;
    }) => Promise<unknown>,
  ): Promise<ReconcileSummary> {
    let created = 0;
    let updated = 0;

    for (const item of artwork) {
      const type = ARTWORK_KIND_TO_IMAGE_TYPE[item.kind];
      const existing = await findExisting(type);
      if (existing) {
        await this.prisma.image.update({
          where: { id: existing.id },
          data: { url: item.url, provider: item.provider },
        });
        updated += 1;
      } else {
        await create({ type, url: item.url, provider: item.provider });
        created += 1;
      }
    }

    return { created, updated, deactivated: 0 };
  }
}
