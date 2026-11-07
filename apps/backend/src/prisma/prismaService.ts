import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createAppConfig, createPrismaClient } from '@ctv-platform/infrastructure';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';

/**
 * Wraps the Prisma client factory reused directly from
 * `@ctv-platform/infrastructure` (Milestone 2) with NestJS lifecycle hooks.
 * Every repository in this app depends on `PrismaService.client`, never on
 * `@prisma/client` directly.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaDatabaseClient;

  constructor() {
    this.client = createPrismaClient(createAppConfig().database);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    await this.addSourceMatchedAt();
  }

  // This database is changed by hand (no migrations), so the one column added since is added here.
  // Titles already compatible get no date - except those marked in the last 3 days, dated by their
  // last update once, so the "recently added in the sources" row doesn't start empty.
  private async addSourceMatchedAt(): Promise<void> {
    for (const table of ['Movie', 'TVShow']) {
      const existing = (await this.client.$queryRawUnsafe(
        `select 1 from information_schema.columns where table_name = '${table}' and column_name = 'sourceMatchedAt'`,
      )) as unknown[];
      if (existing.length > 0) continue;
      await this.client.$executeRawUnsafe(
        `alter table "${table}" add column if not exists "sourceMatchedAt" timestamp(3)`,
      );
      await this.client.$executeRawUnsafe(
        `update "${table}" set "sourceMatchedAt" = "updatedAt" where "hasSourceMatch" = true and "updatedAt" > now() - interval '3 days'`,
      );
    }
    // That first dating (2026-11-07) also caught every series the episode refresh had just rewritten -
    // its seasons were updated within the same minutes, which a source-check mark never does. Those
    // are undated again; nothing dated after that day is touched.
    await this.client.$executeRawUnsafe(
      `update "TVShow" t set "sourceMatchedAt" = null
       where t."sourceMatchedAt" < '2026-11-07T10:50:00Z'
         and exists (select 1 from "Season" s where s."showId" = t.id and s."updatedAt" >= t."sourceMatchedAt" - interval '10 minutes')`,
    );
    // Same for what a TV report re-marked (the TVs re-sent the same titles daily until v218, each time
    // updating them) and for series whose episodes the metadata pass rewrote.
    for (const [table, column] of [
      ['Movie', 'matchedMovieId'],
      ['TVShow', 'matchedShowId'],
    ]) {
      await this.client.$executeRawUnsafe(
        `update "${table}" t set "sourceMatchedAt" = null
         where t."sourceMatchedAt" < '2026-11-07T10:50:00Z'
           and exists (select 1 from "SourceCatalogItem" c where c."${column}" = t.id and c."matchMethod" like 'tv-%'
                       and c."lastAttemptAt" between t."sourceMatchedAt" - interval '10 minutes' and t."sourceMatchedAt" + interval '10 minutes')`,
      );
    }
    await this.client.$executeRawUnsafe(
      `update "TVShow" t set "sourceMatchedAt" = null
       where t."sourceMatchedAt" < '2026-11-07T10:50:00Z'
         and exists (select 1 from "Season" s join "Episode" e on e."seasonId" = s.id
                     where s."showId" = t.id and e."updatedAt" >= t."sourceMatchedAt" - interval '10 minutes')`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
