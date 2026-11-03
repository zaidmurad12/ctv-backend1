import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const movieStatuses = await prisma.movie.groupBy({ by: ['status'], _count: true });
  const showStatuses = await prisma.tVShow.groupBy({ by: ['status'], _count: true });
  console.log('Movie statuses:', movieStatuses);
  console.log('TVShow statuses:', showStatuses);
}
main().finally(() => prisma.$disconnect());
