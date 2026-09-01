import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import { CatalogRefreshService } from '../admin/infrastructure/catalogRefreshService.js';
import { TranslationBackfillService } from '../admin/infrastructure/translationBackfillService.js';

// Cloud Scheduler's own HTTP-triggered jobs, not admin users - so @Public() (no interactive JWT
// login exists for a scheduler) guarded instead by a shared secret header, and left out of the
// Swagger doc entirely (nothing here is meant to be browsed or called by hand). Cloud Run scales
// this service to zero when idle by default, which is exactly why these two jobs are triggered
// this way rather than an in-process @Cron timer (see TranslationBackfillService's own comment) -
// Cloud Scheduler's HTTP call is what actually spins an instance up to run them.
@ApiExcludeController()
@Public()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly translationBackfill: TranslationBackfillService,
    private readonly catalogRefresh: CatalogRefreshService,
  ) {}

  @Post('run-translation-backfill')
  async runTranslationBackfill(
    @Headers('x-scheduler-secret') secret: string,
  ): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.translationBackfill.run();
    return { ok: true };
  }

  @Post('run-catalog-refresh')
  async runCatalogRefresh(@Headers('x-scheduler-secret') secret: string): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.catalogRefresh.run();
    return { ok: true };
  }

  private assertSecret(provided: string | undefined): void {
    const expected = process.env.SCHEDULER_SECRET;
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing scheduler secret.');
    }
  }
}
