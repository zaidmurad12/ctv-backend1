import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import { CatalogRefreshService } from '../admin/infrastructure/catalogRefreshService.js';
import { TranslationBackfillService } from '../admin/infrastructure/translationBackfillService.js';
import { ScheduledImportService } from '../admin/infrastructure/scheduledImportService.js';

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
    private readonly scheduledImport: ScheduledImportService,
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

  @Post('run-scheduled-import')
  async runScheduledImport(@Headers('x-scheduler-secret') secret: string): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.scheduledImport.run();
    return { ok: true };
  }

  // Hides a batch of catalog titles the same way the admin panel's Delete does (soft delete -
  // sets deletedAt, fully reversible by clearing it). For cleaning up junk an import let in without
  // an interactive admin login. Takes catalog ids (not TMDB ids), at most 100 per call.
  @Post('soft-delete-titles')
  async softDeleteTitles(
    @Headers('x-scheduler-secret') secret: string,
    @Body() body: { movies?: unknown; shows?: unknown },
  ): Promise<{ movies: number; shows: number }> {
    this.assertSecret(secret);
    const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
    const movies = ids(body?.movies);
    const shows = ids(body?.shows);
    if (movies.length + shows.length > 100) throw new BadRequestException('At most 100 ids per call.');
    return this.scheduledImport.softDeleteTitles(movies, shows);
  }

  // The several-times-a-day newest-releases pass - see ScheduledImportService.runNewestOnly.
  @Post('run-newest-import')
  async runNewestImport(@Headers('x-scheduler-secret') secret: string): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.scheduledImport.runNewestOnly();
    return { ok: true };
  }

  // Standalone trigger for ScheduledImportService's sourceMatchCheck pass alone - see its own
  // comment on why this exists separately from run-scheduled-import above (that one only reaches
  // this pass after several other, potentially long-running ones).
  @Post('run-source-match-check')
  async runSourceMatchCheck(@Headers('x-scheduler-secret') secret: string): Promise<{ ok: true }> {
    this.assertSecret(secret);
    await this.scheduledImport.runSourceMatchCheckOnly();
    return { ok: true };
  }

  private assertSecret(provided: string | undefined): void {
    const expected = process.env.SCHEDULER_SECRET;
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing scheduler secret.');
    }
  }
}
