import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';

export interface ProviderRegistryRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly baseUrl: string | null;
  readonly isEnabled: boolean;
  readonly priority: number;
  readonly healthStatus: string;
  readonly lastCheck: Date | null;
  readonly lastSyncAt: Date | null;
}

/**
 * Prisma-backed CRUD on the `Provider` table's registry metadata (enabled
 * state, priority, sync timestamp). Deliberately separate from
 * `PrismaContentProviderLinkRepository` (`@ctv-platform/importer`), which
 * owns content-linking (`MovieProvider`/`EpisodeProvider`/`TVShowProvider`)
 * — this repository only concerns the `Provider` row itself, the thing the
 * admin Providers page manages.
 */
@Injectable()
export class ProviderRegistryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async findBySlug(slug: string): Promise<ProviderRegistryRow | null> {
    const row = await this.prisma.provider.findUnique({ where: { slug } });
    return row ? this.toRow(row) : null;
  }

  async list(): Promise<ProviderRegistryRow[]> {
    const rows = await this.prisma.provider.findMany();
    return rows.map((row) => this.toRow(row));
  }

  /**
   * Ensures a `Provider` row exists for a registered SDK provider. On first
   * creation it seeds `baseUrl`/`priority` from the provider's env-derived
   * defaults; on subsequent boots it only refreshes `name`/`baseUrl` and
   * deliberately leaves `priority`/`isEnabled` untouched so an admin's
   * runtime changes survive a restart.
   */
  async syncDefaults(
    slug: string,
    name: string,
    baseUrl: string | null,
    defaultPriority: number,
  ): Promise<ProviderRegistryRow> {
    const row = await this.prisma.provider.upsert({
      where: { slug },
      create: { slug, name, version: '1.0.0', baseUrl, priority: defaultPriority },
      update: { name, baseUrl },
    });
    return this.toRow(row);
  }

  async setEnabled(slug: string, isEnabled: boolean): Promise<ProviderRegistryRow> {
    const row = await this.prisma.provider.update({ where: { slug }, data: { isEnabled } });
    return this.toRow(row);
  }

  async setPriority(slug: string, priority: number): Promise<ProviderRegistryRow> {
    const row = await this.prisma.provider.update({ where: { slug }, data: { priority } });
    return this.toRow(row);
  }

  async touchLastSync(slug: string): Promise<void> {
    await this.prisma.provider.update({ where: { slug }, data: { lastSyncAt: new Date() } });
  }

  private toRow(row: {
    id: string;
    slug: string;
    name: string;
    baseUrl: string | null;
    isEnabled: boolean;
    priority: number;
    healthStatus: string;
    lastCheck: Date | null;
    lastSyncAt: Date | null;
  }): ProviderRegistryRow {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      baseUrl: row.baseUrl,
      isEnabled: row.isEnabled,
      priority: row.priority,
      healthStatus: row.healthStatus,
      lastCheck: row.lastCheck,
      lastSyncAt: row.lastSyncAt,
    };
  }
}
