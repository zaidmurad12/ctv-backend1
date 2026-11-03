/**
 * Prints the database size in whole MB. The daily GitHub Actions run uses it to stop importing
 * before Neon's free 1 GB project cap, where writes stop working.
 *
 * Usage: node prisma/db-size.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const rows = await prisma.$queryRaw`select (pg_database_size(current_database()) / 1048576)::int as mb`;
  console.log(rows[0].mb);
} finally {
  await prisma.$disconnect();
}
