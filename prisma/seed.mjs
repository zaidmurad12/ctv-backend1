/**
 * Bootstraps the one piece of data the platform cannot create for itself:
 * an initial Administrator account. Without this, a fresh database has no
 * way to sign into apps/admin at all.
 *
 * Hashes the password with the same library, algorithm, and (by default)
 * salt round count as apps/backend's real auth path
 * (BcryptPasswordHasher in apps/backend/src/auth/infrastructure/authServices.ts),
 * so the seeded user can log in through the normal `/auth/login` endpoint.
 *
 * Idempotent: every write is an upsert keyed on a unique column, so running
 * this repeatedly never duplicates roles or the admin user, and never
 * clobbers a password that may have since been changed through the app.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // No .env file (e.g. real environment variables are already set) — proceed.
}

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

const ADMIN_EMAIL = 'admin@ctv.local';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';

const ROLE_NAMES = ['ADMIN', 'EDITOR', 'VIEWER'];

const prisma = new PrismaClient();

async function main() {
  const roles = {};
  for (const name of ROLE_NAMES) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`Roles ready: ${ROLE_NAMES.join(', ')}`);

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      passwordHash,
      roleId: roles.ADMIN.id,
      isActive: true,
    },
    update: {},
  });

  console.log(`Administrator user ready: ${admin.email} (role: ${ROLE_NAMES[0]})`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
