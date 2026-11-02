import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// See TmdbImportService's own comment for the same reuse-a-tested-script-via-child-process
// reasoning. This one exists because a show is otherwise only ever checked against TMDB again
// when an admin manually clicks "re-import" on it - so a show published months ago silently
// never picks up a season/episode TMDB has added since, even though nothing in the catalog would
// ever surface that as a problem (reported as "shows with more seasons than we imported just
// stop getting new ones"). Running the same reimport TMDB-side logic for every PUBLISHED show on
// a schedule is what keeps that from requiring anyone to remember to check.
//
// Triggered by InternalController (Cloud Scheduler -> HTTP -> here), *not* @Cron - see
// TranslationBackfillService's own comment for why an in-process timer doesn't reliably fire on
// Cloud Run's default scale-to-zero behavior.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable()
export class CatalogRefreshService {
  private readonly logger = new Logger(CatalogRefreshService.name);
  private running = false;

  async run(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous catalog refresh run is still in progress, skipping this trigger.');
      return;
    }
    this.running = true;
    try {
      this.logger.log('Starting prisma/reimport-published-shows.mjs...');
      const { stdout } = await execFileAsync('node', ['prisma/reimport-published-shows.mjs'], {
        cwd: REPO_ROOT,
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      });
      const summaryLine = stdout.trim().split('\n').filter(Boolean).pop() ?? '(no output)';
      this.logger.log(`reimport-published-shows.mjs finished: ${summaryLine}`);
    } catch (err) {
      // The script's own last lines say why (a timeout kill used to log only "Command failed").
      const e = err as { killed?: boolean; signal?: string; stdout?: string; stderr?: string; message?: string };
      const tail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim().split('\n').filter(Boolean).slice(-5).join(' | ');
      this.logger.error(
        `reimport-published-shows.mjs failed${e.killed ? ` (killed, ${e.signal ?? 'timeout'})` : ''}: ${tail || e.message || String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
