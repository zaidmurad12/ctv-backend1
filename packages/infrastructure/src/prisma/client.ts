import { PrismaClient } from '@prisma/client';

export type PrismaDatabaseClient = PrismaClient;

export function createPrismaClient(): PrismaDatabaseClient {
  return new PrismaClient();
}
