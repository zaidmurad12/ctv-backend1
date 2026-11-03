import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
// Money Heist (tmdb 71446) was already re-split into 5 parts by split-money-heist-parts.mjs.
const r = await p.tVShow.updateMany({ where: { tmdbId: '71446' }, data: { seasonLayoutCustom: true } });
console.log('marked', r.count);
await p.$disconnect();
