import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const total = await prisma.movie.count({ where: { sourceMatchCheckedAt: { not: null } } });
  const falseCount = await prisma.movie.count({ where: { sourceMatchCheckedAt: { not: null }, hasSourceMatch: false } });
  const trueCount = await prisma.movie.count({ where: { sourceMatchCheckedAt: { not: null }, hasSourceMatch: true } });
  console.log(`Checked: ${total}, hasSourceMatch=false: ${falseCount}, hasSourceMatch=true: ${trueCount}`);
}
main().finally(() => prisma.$disconnect());
