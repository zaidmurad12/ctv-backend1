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
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
