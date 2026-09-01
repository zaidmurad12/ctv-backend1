import { Injectable, BadRequestException } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';

export interface SyncIssueSummary {
  id: string;
  movieId: string | null;
  episodeId: string | null;
  // The parent show's id, for an episode-based issue - editing an episode's subtitle happens on
  // the show's own detail page (episodes have no standalone admin page of their own), so this is
  // what the admin panel actually needs to link to, not episodeId itself.
  showId: string | null;
  title: string;
  offsetMs: number;
  speed: number;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  resolved: boolean;
}

// Backs both the public report endpoint (see syncIssues.controller.ts - the app calls this once
// its own audio-sync feature confidently detects a real mismatch) and the admin panel's own
// "أعمال ترجمتها غير متطابقة" tab. One row per title, upserted rather than appended - see
// SyncIssue's own comment in schema.prisma for why a repeat report clears `resolved` back to
// false even after an admin already marked it fixed once.
@Injectable()
export class SyncIssueRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async report(
    movieId: string | undefined,
    episodeId: string | undefined,
    offsetMs: number,
    speed: number,
  ): Promise<void> {
    if (!movieId && !episodeId) {
      throw new BadRequestException('Either movieId or episodeId is required.');
    }
    if (movieId) {
      const existing = await this.prisma.syncIssue.findUnique({ where: { movieId } });
      if (existing) {
        await this.prisma.syncIssue.update({
          where: { movieId },
          data: { offsetMs, speed, reportCount: { increment: 1 }, resolved: false },
        });
      } else {
        await this.prisma.syncIssue.create({ data: { movieId, offsetMs, speed } });
      }
    } else if (episodeId) {
      const existing = await this.prisma.syncIssue.findUnique({ where: { episodeId } });
      if (existing) {
        await this.prisma.syncIssue.update({
          where: { episodeId },
          data: { offsetMs, speed, reportCount: { increment: 1 }, resolved: false },
        });
      } else {
        await this.prisma.syncIssue.create({ data: { episodeId, offsetMs, speed } });
      }
    }
  }

  async list(resolved: boolean): Promise<SyncIssueSummary[]> {
    const rows = await this.prisma.syncIssue.findMany({
      where: { resolved },
      orderBy: { lastReportedAt: 'desc' },
      include: {
        movie: { select: { title: true, titleAr: true } },
        episode: {
          select: {
            title: true,
            episodeNumber: true,
            season: {
              select: {
                seasonNumber: true,
                show: { select: { id: true, title: true, titleAr: true } },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      movieId: row.movieId,
      episodeId: row.episodeId,
      showId: row.episode?.season.show.id ?? null,
      title: row.movie
        ? (row.movie.titleAr ?? row.movie.title)
        : row.episode
          ? `${row.episode.season.show.titleAr ?? row.episode.season.show.title} - م${row.episode.season.seasonNumber} ح${row.episode.episodeNumber}`
          : 'غير معروف',
      offsetMs: row.offsetMs,
      speed: row.speed,
      reportCount: row.reportCount,
      firstReportedAt: row.firstReportedAt.toISOString(),
      lastReportedAt: row.lastReportedAt.toISOString(),
      resolved: row.resolved,
    }));
  }

  async resolve(id: string, resolved: boolean): Promise<void> {
    await this.prisma.syncIssue.update({ where: { id }, data: { resolved } });
  }
}
