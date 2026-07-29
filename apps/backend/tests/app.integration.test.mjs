process.env.JWT_SECRET = 'test-access-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.DATABASE_URL = 'postgresql://ctv:ctv@localhost:5432/ctv_dev';

import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';

const { Test } = await import('@nestjs/testing');
const { ValidationPipe } = await import('@nestjs/common');
const supertestModule = await import('supertest');
const supertest = supertestModule.default;
const { AppModule } = await import('../dist/app.module.js');
const { PrismaService } = await import('../dist/prisma/prismaService.js');
const { USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY } = await import('../dist/auth/ports.js');
const { FavoriteRepository } = await import('../dist/favorites/infrastructure/favoriteRepository.js');

function fakePrismaService() {
  return { client: {}, onModuleInit: async () => {}, onModuleDestroy: async () => {} };
}

function fakeUserRepository() {
  const users = [];
  return {
    save: async (user) => {
      const index = users.findIndex((existing) => existing.id === user.id);
      if (index >= 0) users[index] = user;
      else users.push(user);
    },
    findById: async (id) => users.find((user) => user.id === id) ?? null,
    findByEmail: async (email) => users.find((user) => user.email.value === email.toLowerCase()) ?? null,
    findByUsername: async (username) => users.find((user) => user.username.value === username) ?? null,
    list: async () => ({ items: users, total: users.length }),
  };
}

function fakeRefreshTokenRepository() {
  const tokens = new Map();
  let counter = 0;
  return {
    create: async (userId, tokenHash, expiresAt) => {
      counter += 1;
      const id = `token-${counter}`;
      tokens.set(id, { id, userId, tokenHash, expiresAt, revokedAt: null });
      return id;
    },
    findByHash: async (tokenHash) => [...tokens.values()].find((t) => t.tokenHash === tokenHash) ?? null,
    revoke: async (id) => {
      const token = tokens.get(id);
      if (token) token.revokedAt = new Date();
    },
    revokeAllForUser: async () => {},
  };
}

async function buildApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(fakePrismaService())
    .overrideProvider(USER_REPOSITORY)
    .useValue(fakeUserRepository())
    .overrideProvider(REFRESH_TOKEN_REPOSITORY)
    .useValue(fakeRefreshTokenRepository())
    .overrideProvider(FavoriteRepository)
    .useValue({ add: async () => 'fav-1', remove: async () => 1, list: async () => [] })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

test('register -> login -> profile -> refresh -> logout works end-to-end through real HTTP', async () => {
  const app = await buildApp();
  const server = app.getHttpServer();

  try {
    const registerRes = await supertest(server)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', username: 'testuser', password: 'Sup3r-Secret!!' });
    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.success, true);
    assert.ok(registerRes.body.data.accessToken);
    assert.equal(registerRes.body.data.user.email, 'test@example.com');

    const loginRes = await supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Sup3r-Secret!!' });
    assert.equal(loginRes.status, 200);
    const { accessToken, refreshToken } = loginRes.body.data;

    const profileRes = await supertest(server).get('/api/v1/auth/profile').set('Authorization', `Bearer ${accessToken}`);
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.data.username, 'testuser');

    const refreshRes = await supertest(server).post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(refreshRes.status, 200);
    assert.notEqual(refreshRes.body.data.refreshToken, refreshToken);

    const logoutRes = await supertest(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`)
      .send({ refreshToken: refreshRes.body.data.refreshToken });
    assert.equal(logoutRes.status, 204);
  } finally {
    await app.close();
  }
});

test('protected routes reject requests with no bearer token', async () => {
  const app = await buildApp();
  try {
    const res = await supertest(app.getHttpServer()).get('/api/v1/auth/profile');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  } finally {
    await app.close();
  }
});

test('admin routes reject a VIEWER even when authenticated', async () => {
  const app = await buildApp();
  try {
    const registerRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'viewer@example.com', username: 'viewer1', password: 'Sup3r-Secret!!' });
    const { accessToken } = registerRes.body.data;

    const res = await supertest(app.getHttpServer()).get('/api/v1/admin/users').set('Authorization', `Bearer ${accessToken}`);
    assert.equal(res.status, 403);
  } finally {
    await app.close();
  }
});

test('validation errors are returned in the standard error envelope', async () => {
  const app = await buildApp();
  try {
    const res = await supertest(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'not-an-email', username: 'a', password: 'x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message);
  } finally {
    await app.close();
  }
});

test('health endpoint is public and reachable without a token', async () => {
  const app = await buildApp();
  try {
    const res = await supertest(app.getHttpServer()).get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(['healthy', 'degraded'].includes(res.body.data.status));
  } finally {
    await app.close();
  }
});

test('favorites endpoint round-trips through the overridden repository', async () => {
  const app = await buildApp();
  try {
    const registerRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'fan@example.com', username: 'fan1', password: 'Sup3r-Secret!!' });
    const { accessToken } = registerRes.body.data;

    const addRes = await supertest(app.getHttpServer())
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ movieId: '11111111-1111-4111-8111-111111111111' });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.data.id, 'fav-1');

    const listRes = await supertest(app.getHttpServer()).get('/api/v1/favorites').set('Authorization', `Bearer ${accessToken}`);
    assert.equal(listRes.status, 200);
    assert.deepEqual(listRes.body.data, []);
  } finally {
    await app.close();
  }
});
