import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// Retires the DRAFT-on-no-stream policy entirely, per explicit instruction: publish every title
// unconditionally and let the app's own live compatibility check gate the play button instead.
async function main() {
  const movies = await prisma.movie.updateMany({ where: { status: 'DRAFT' }, data: { status: 'PUBLISHED' } });
  const shows = await prisma.tVShow.updateMany({ where: { status: { not: 'PUBLISHED' } }, data: { status: 'PUBLISHED' } });
  console.log(`Movies published: ${movies.count}`);
  console.log(`Shows published: ${shows.count}`);
}
main().finally(() => prisma.$disconnect());
