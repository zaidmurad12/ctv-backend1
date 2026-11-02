import { PrismaClient } from '@prisma/client';
import { HomeSectionsAdminService } from '../apps/backend/dist/admin/homeSectionsAdmin.js';
import { TmdbLookupService } from '../apps/backend/dist/admin/infrastructure/tmdbLookupService.js';
const client = new PrismaClient();
const svc = new HomeSectionsAdminService({ client }, new TmdbLookupService(), null);
const r = await svc.previewTmdbList('https://www.themoviedb.org/list/634-something', 30);
console.log(r.listId, '|', r.name, '| total', r.total, '| returned', r.items.length);
console.log(r.items.slice(0, 4).map((i) => `${i.title} (${i.year}) ${i.mediaType} inCatalog=${i.inCatalog}`));
await client.$disconnect();
