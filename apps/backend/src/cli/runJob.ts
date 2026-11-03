import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ScheduledImportService } from '../admin/infrastructure/scheduledImportService.js';

// Runs one scheduled import pass to completion from the command line (GitHub Actions - see
// .github/workflows/daily-jobs.yml) instead of through the web server, so it doesn't depend on
// the free web host staying awake and isn't cut off by its request time limit.
// Only the passes that talk to TMDB. The stream health check and source match check are left out on
// purpose: CEE and Cinemana refuse connections from servers outside Iraq, and those two passes read
// a refused connection as "link is dead" and unpublish working titles.
const jobs: Record<string, (service: ScheduledImportService) => Promise<void>> = {
  'newest-import': (service) => service.runNewestOnly(),
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  const job = jobs[name];
  if (!job) throw new Error(`Unknown job "${name}". Available: ${Object.keys(jobs).join(', ')}`);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    await job(app.get(ScheduledImportService, { strict: false }));
  } finally {
    await app.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
