import type { ProviderLogger } from '@ctv-platform/sdk';

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: readonly Level[] = ['debug', 'info', 'warn', 'error'];

/**
 * A minimal console logger local to this package, for the same reason
 * `provider-consumet/src/logger.ts` has its own: importing
 * `@ctv-platform/infrastructure`'s `ConsoleLogger` here would pull in that
 * package's Prisma/Redis dependencies transitively, and this provider must
 * stay self-contained (`@ctv-platform/sdk` + `@ctv-platform/domain` + `zod`
 * only) per `specification/05-Provider-Architecture.md.txt`'s "Never access
 * Prisma."
 */
export class CinemanaConsoleLogger implements ProviderLogger {
  constructor(private readonly level: Level = 'warn') {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  private write(level: Level, message: string, meta?: Record<string, unknown>): void {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(this.level)) {
      return;
    }
    const payload = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[cinemana:${level}] ${message}${payload}`);
  }
}
