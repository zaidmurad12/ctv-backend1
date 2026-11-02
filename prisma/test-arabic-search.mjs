import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const FROM = 'أإآىة', TO = 'ااايه';
const like = '%' + 'افاتار' + '%';
const rows = await p.$queryRaw`SELECT "titleAr" FROM "Movie" WHERE "deletedAt" IS NULL AND status = 'PUBLISHED' AND translate(coalesce("titleAr", ''), ${FROM}, ${TO}) ILIKE ${like} LIMIT 5`;
console.log(rows);
const plain = await p.movie.count({ where: { titleAr: { contains: 'افاتار', mode: 'insensitive' } } });
console.log('plain contains count:', plain);
await p.$disconnect();
