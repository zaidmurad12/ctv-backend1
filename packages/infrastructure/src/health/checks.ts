export interface HealthCheck {
  name: string;
  check(): Promise<boolean>;
}

export class HealthChecker {
  constructor(private readonly checks: HealthCheck[]) {}

  async run(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const check of this.checks) {
      results[check.name] = await check.check();
    }
    return results;
  }
}
