/**
 * Minimal logging port owned by the SDK so it never depends on
 * `@ctv-platform/infrastructure`. Infrastructure's `ConsoleLogger` already
 * satisfies this shape structurally, so no adapter is needed when wiring a
 * concrete provider in a composition root.
 */
export interface ProviderLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
