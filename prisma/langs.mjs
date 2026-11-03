import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const m = await p.movie.groupBy({ by: ['originalLanguage'], _count: true });
const s = await p.tVShow.groupBy({ by: ['originalLanguage'], _count: true });
console.log(JSON.stringify({ movies: m.map(x=>[x.originalLanguage,x._count]), shows: s.map(x=>[x.originalLanguage,x._count]) }));
await p.$disconnect();
