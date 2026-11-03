import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const [m, s, ar] = await Promise.all([p.movie.count(), p.tVShow.count(), p.movie.count({ where: { originalLanguage: 'ar' } })]);
const tr = await p.movie.count({ where: { originalLanguage: 'tr' } });
console.log({ movies: m, shows: s, arMovies: ar, trMovies: tr });
await p.$disconnect();
