import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Cloud Run's runtime stage sets WORKDIR /repo and runs `node apps/backend/dist/main.js` from
// there (see the root Dockerfile) - prisma/import-one.mjs lives at <repo root>/prisma, so
// process.cwd() already points at the right place in production. REPO_ROOT lets this be
// overridden for local runs where the backend isn't started from the repo root.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();

// Reuses prisma/bootstrap-importer.mjs's own tested TMDB-import logic via a one-shot child
// process (see prisma/import-one.mjs) rather than re-implementing cast/crew/genre/company/
// country/language/artwork mapping a second time in TypeScript - that logic is intricate and
// already proven; a second hand-written copy here would only drift from it over time.
@Injectable()
export class TmdbImportService {
  async importMovie(tmdbId: string): Promise<string> {
    return this.run('movie', tmdbId);
  }

  async importShow(tmdbId: string): Promise<string> {
    return this.run('show', tmdbId);
  }

  private async run(type: 'movie' | 'show', tmdbId: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'node',
        ['prisma/import-one.mjs', `--type=${type}`, `--tmdbId=${tmdbId}`],
        {
          cwd: REPO_ROOT,
          timeout: 120_000,
          // Skips Gemini bio-translation retries for this on-demand path (see the flag's own
          // comment in bootstrap-importer.mjs) - an admin waiting on one click shouldn't sit
          // through several people's worth of exhausted-quota backoff. The bulk reimport
          // scripts still translate normally.
          env: { ...process.env, SKIP_GEMINI_TRANSLATION: '1' },
        },
      );
      const lastLine = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
      const parsed = JSON.parse(lastLine) as { id: string };
      if (!parsed.id) throw new Error('Import script did not return an id.');
      return parsed.id;
    } catch (err) {
      throw new InternalServerErrorException(
        `TMDB import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
