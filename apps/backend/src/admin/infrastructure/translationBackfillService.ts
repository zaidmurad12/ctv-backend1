import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// See TmdbImportService's own comment - same reasoning, same pattern: reuses the already-proven
// prisma/backfill-*.mjs scripts via a child process instead of re-implementing their TMDB/Gemini
// translation logic a second time in TypeScript.
//
// Why this needs to exist at all: admin-triggered imports (TmdbImportService) run with
// SKIP_GEMINI_TRANSLATION=1 so a single "import this title" click never sits through Gemini's
// retry/backoff - so any title TMDB itself has no Arabic translation for is *permanently* left
// without one from that path alone. The bulk bootstrap script does call Gemini, but its own free-
// tier quota is small enough to exhaust mid-run on an ordinary catalog size. Both gaps self-heal
// the same way: periodically re-scan for rows still missing overviewAr/biographyAr and retry
// them - which is exactly what these two scripts already do (they only ever touch null rows).
//
// Triggered by InternalController (Cloud Scheduler -> HTTP -> here), *not* @Cron - Cloud Run
// scales to zero when idle by default, and an in-process timer only ever fires if some instance
// happens to already be running at that wall-clock moment, which for a low-traffic admin API it
// usually isn't. An HTTP-triggered job is what Cloud Scheduler actually spins an instance up for.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

@Injectable()
export class TranslationBackfillService {
  private readonly logger = new Logger(TranslationBackfillService.name);
  private running = false;

  async run(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Previous translation backfill run is still in progress, skipping this trigger.',
      );
      return;
    }
    this.running = true;
    try {
      await this.runScript('prisma/backfill-overview-translations.mjs');
      await this.runScript('prisma/backfill-person-details.mjs');
    } finally {
      this.running = false;
    }
  }

  private async runScript(scriptPath: string): Promise<void> {
    this.logger.log(`Starting ${scriptPath}...`);
    try {
      const { stdout } = await execFileAsync('node', [scriptPath], {
        cwd: REPO_ROOT,
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      });
      const lines = stdout.trim().split('\n').filter(Boolean);
      const summaryLine = lines.pop() ?? '(no output)';
      // The summary line alone ("Filled in: 0, still nothing on TMDB or fetch kept failing: N")
      // can't tell a genuinely-empty-on-TMDB person apart from a real fetch failure (network,
      // rate limit, bad response) - both silently fall into the same bucket. A per-person
      // "fetch failed (<error>)" line already exists in these scripts' own output; surfacing a
      // sample of those specifically (not the full per-person log, which can run into the
      // thousands of lines) is what actually makes "0 filled" diagnosable instead of a dead end.
      const failureLines = lines.filter((l) => l.includes('fetch failed') || l.includes('translation failed'));
      if (failureLines.length > 0) {
        this.logger.warn(
          `${scriptPath}: ${failureLines.length} per-item failures, sample: ${failureLines.slice(0, 5).join(' | ')}`,
        );
      }
      this.logger.log(`${scriptPath} finished: ${summaryLine}`);
    } catch (err) {
      this.logger.error(
        `${scriptPath} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
