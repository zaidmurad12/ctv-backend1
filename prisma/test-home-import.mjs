import { PrismaClient } from '@prisma/client';
import { HomeSectionsAdminService } from '../apps/backend/dist/admin/homeSectionsAdmin.js';
import { TmdbLookupService } from '../apps/backend/dist/admin/infrastructure/tmdbLookupService.js';
import { TmdbImportService } from '../apps/backend/dist/admin/infrastructure/tmdbImportService.js';
const client = new PrismaClient();
const svc = new HomeSectionsAdminService({ client }, new TmdbLookupService(), new TmdbImportService());
const section = await svc.create({ kind: 'CUSTOM', titleAr: 'اختبار', titleEn: 'ZZ test', maxItems: 20 });
try {
  await svc.startImport(section.id, { source: 'preset', preset: 'top-rated-movies', limit: 6, importMissing: true });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await client.homeSection.findUnique({ where: { id: section.id } });
    console.log(s.importStatus, s.importDone + '/' + s.importTotal);
    if (s.importStatus !== 'IMPORTING') break;
  }
  console.log((await svc.items(section.id)).map((i) => `${i.title} (${i.year}) ${i.status}`));
} finally {
  await client.homeSection.delete({ where: { id: section.id } });
  console.log('section cleaned up');
  await client.$disconnect();
}
