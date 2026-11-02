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
// backfill-arabic-titles.mjs joins them for the same reason, closing a titleAr gap for
// Arabic-original titles that weakens CEE/Cinemana source matching, not just display.
//
// Triggered by InternalController (Cloud Scheduler -> HTTP -> here), *not* @Cron - Cloud Run
// scales to zero when idle by default, and an in-process timer only ever fires if some instance
// happens to already be running at that wall-clock moment, which for a low-traffic admin API it
// usually isn't. An HTTP-triggered job is what Cloud Scheduler actually spins an instance up for.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
// Was 20 minutes - the overview and person-biography passes (paced Gemini calls) were being cut
// off at exactly that mark night after night, so their translations never finished.
const RUN_TIMEOUT_MS = 45 * 60 * 1000;

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
      // Arabic-original titles specifically missing their own Arabic name - see this script's own
      // comment for why that's a source-matching problem, not just a display one. Runs first: it's
      // quick, and at the end it never got to finish - the two scripts before it were each hitting
      // RUN_TIMEOUT_MS every day, and this one was then cut off at the same limit.
      await this.runScript('prisma/backfill-arabic-titles.mjs');
      // Title logos for anything still without one. Titles imported before pickLogo accepted every
      // readable (Latin-script + Arabic) language - Turkish, German, French, ... - kept their empty
      // logo forever, since nothing ever revisited them. Also quick (one TMDB call per title), so
      // it runs ahead of the two slow scripts below.
      await this.runScript('prisma/backfill-logos.mjs');
      // Marks each logo dark/light (see the script) so the app can draw near-black logos white.
      await this.runScript('prisma/backfill-logo-tone.mjs');
      // Same idea for a missing poster/backdrop - fills only what's missing, never replaces.
      await this.runScript('prisma/backfill-artwork.mjs');
      // Ratings for titles imported before they had any votes (shown as "IMDb 0"), and recent
      // releases whose rating is still settling.
      await this.runScript('prisma/backfill-ratings.mjs');
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
