import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
if ((await p.homeSection.count()) === 0) {
  await p.homeSection.createMany({
    data: [
      { kind: 'RECENT', titleAr: 'الأحدث', titleEn: 'Recently Added', sortOrder: 0 },
      { kind: 'POPULAR', titleAr: 'الأكثر شعبية', titleEn: 'Trending', sortOrder: 1 },
      { kind: 'TOP_RATED', titleAr: 'الأعلى تقييمًا', titleEn: 'Top Rated', sortOrder: 2 },
      { kind: 'SERIES', titleAr: 'المسلسلات', titleEn: 'TV Shows', sortOrder: 3 },
    ],
  });
  console.log('seeded 4 default sections');
} else console.log('already has sections');
await p.$disconnect();
