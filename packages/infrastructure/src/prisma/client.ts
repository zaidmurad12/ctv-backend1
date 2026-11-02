import { PrismaClient } from '@prisma/client';
import type { DatabaseConfig } from '../config/env.js';

export type PrismaDatabaseClient = PrismaClient;

function buildDatasourceUrl(config: DatabaseConfig): string {
  const url = new URL(config.url);
  if (url.protocol === 'postgresql:' || url.protocol === 'postgres:') {
    url.searchParams.set('connection_limit', String(config.pool));
    url.searchParams.set('pool_timeout', String(Math.ceil(config.timeoutMs / 1000)));
  }
  return url.toString();
}

export function createPrismaClient(config: DatabaseConfig): PrismaDatabaseClient {
  return new PrismaClient({
    datasourceUrl: buildDatasourceUrl(config),
    log: config.logging ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
}
import { PrismaClient } from '@prisma/client';
import type { DatabaseConfig } from '../config/env.js';

export type PrismaDatabaseClient = PrismaClient;

function buildDatasourceUrl(config: DatabaseConfig): string {
  const url = new URL(config.url);
  if (url.protocol === 'postgresql:' || url.protocol === 'postgres:') {
    url.searchParams.set('connection_limit', String(config.pool));
    url.searchParams.set('pool_timeout', String(Math.ceil(config.timeoutMs / 1000)));
  }
  return url.toString();
}

export function createPrismaClient(config: DatabaseConfig): PrismaDatabaseClient {
  return new PrismaClient({
    datasourceUrl: buildDatasourceUrl(config),
    log: config.logging ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
}
import { PrismaClient } from '@prisma/client';
import type { DatabaseConfig } from '../config/env.js';

export type PrismaDatabaseClient = PrismaClient;

function buildDatasourceUrl(config: DatabaseConfig): string {
  const url = new URL(config.url);
  url.searchParams.set('connection_limit', String(config.pool));
  url.searchParams.set('pool_timeout', String(Math.ceil(config.timeoutMs / 1000)));
  return url.toString();
}

export function createPrismaClient(config: DatabaseConfig): PrismaDatabaseClient {
  return new PrismaClient({
    datasourceUrl: buildDatasourceUrl(config),
    log: config.logging ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
}
