import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaUnitOfWork } from '../dist/index.js';

function fakePrismaClient() {
  return {
    movie: { upsert: async (args) => ({ ...args.create }) },
    tVShow: { upsert: async (args) => ({ ...args.create }) },
    season: { upsert: async (args) => ({ ...args.create }) },
    episode: { upsert: async (args) => ({ ...args.create }) },
    async $transaction(callback) {
      return callback(this);
    },
  };
}

test('PrismaUnitOfWork.execute exposes repositories bound to the transactional client', async () => {
  const prisma = fakePrismaClient();
  const unitOfWork = new PrismaUnitOfWork(prisma);

  const repositoryKeys = await unitOfWork.execute(async (repositories) =>
    Object.keys(repositories),
  );

  assert.deepEqual(repositoryKeys.sort(), ['episodes', 'movies', 'seasons', 'tvShows']);
});

test('PrismaUnitOfWork.execute propagates the callback result', async () => {
  const prisma = fakePrismaClient();
  const unitOfWork = new PrismaUnitOfWork(prisma);

  const result = await unitOfWork.execute(async () => 'done');

  assert.equal(result, 'done');
});

test('PrismaUnitOfWork.execute propagates errors so the transaction rolls back', async () => {
  const prisma = fakePrismaClient();
  const unitOfWork = new PrismaUnitOfWork(prisma);

  await assert.rejects(
    unitOfWork.execute(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
});
