import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthUseCases } from '../dist/auth/useCases.js';

function fakeUserRepository(initial = []) {
  const users = [...initial];
  return {
    users,
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
    tokens,
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
    revokeAllForUser: async (userId) => {
      for (const token of tokens.values()) {
        if (token.userId === userId) token.revokedAt = new Date();
      }
    },
  };
}

function fakeHasher() {
  return {
    hash: async (plain) => `hashed:${plain}`,
    verify: async (plain, hash) => hash === `hashed:${plain}`,
  };
}

function fakeTokenService() {
  let counter = 0;
  return {
    issueAccessToken: (payload) => `access:${payload.sub}`,
    issueRefreshToken: () => {
      counter += 1;
      return { token: `refresh-token-${counter}`, expiresAt: new Date(Date.now() + 1_000_000) };
    },
    hashRefreshToken: (token) => `hash:${token}`,
  };
}

function buildUseCases(seedUsers = []) {
  const users = fakeUserRepository(seedUsers);
  const refreshTokens = fakeRefreshTokenRepository();
  const hasher = fakeHasher();
  const tokens = fakeTokenService();
  return { useCases: new AuthUseCases(users, refreshTokens, hasher, tokens), users, refreshTokens, hasher, tokens };
}

test('register creates a new VIEWER user and issues a session', async () => {
  const { useCases, users } = buildUseCases();

  const session = await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  assert.equal(session.user.role, 'VIEWER');
  assert.equal(users.users.length, 1);
  assert.ok(session.accessToken.startsWith('access:'));
  assert.ok(session.refreshToken.startsWith('refresh-token-'));
});

test('register rejects a weak password before touching the repository', async () => {
  const { useCases, users } = buildUseCases();

  await assert.rejects(() => useCases.register({ email: 'a@b.com', username: 'alice', password: 'short' }));
  assert.equal(users.users.length, 0);
});

test('register rejects a duplicate email with a ConflictError', async () => {
  const { useCases } = buildUseCases();
  await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  await assert.rejects(
    () => useCases.register({ email: 'a@b.com', username: 'someone-else', password: 'Sup3r-Secret!!' }),
    /already exists/
  );
});

test('login fails for an unknown email', async () => {
  const { useCases } = buildUseCases();
  await assert.rejects(() => useCases.login({ email: 'missing@b.com', password: 'whatever' }));
});

test('login fails for an incorrect password', async () => {
  const { useCases } = buildUseCases();
  await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  await assert.rejects(() => useCases.login({ email: 'a@b.com', password: 'wrong-password' }));
});

test('login succeeds with the correct credentials', async () => {
  const { useCases } = buildUseCases();
  await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  const session = await useCases.login({ email: 'a@b.com', password: 'Sup3r-Secret!!' });
  assert.equal(session.user.email.value, 'a@b.com');
});

test('refresh rotates the token: the old one no longer works after use', async () => {
  const { useCases } = buildUseCases();
  const { refreshToken } = await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  const rotated = await useCases.refresh(refreshToken);
  assert.notEqual(rotated.refreshToken, refreshToken);

  await assert.rejects(() => useCases.refresh(refreshToken));
});

test('logout revokes the refresh token so it can no longer be used', async () => {
  const { useCases } = buildUseCases();
  const { refreshToken } = await useCases.register({ email: 'a@b.com', username: 'alice', password: 'Sup3r-Secret!!' });

  await useCases.logout(refreshToken);
  await assert.rejects(() => useCases.refresh(refreshToken));
});

test('getProfile throws NotFoundError for an unknown user id', async () => {
  const { useCases } = buildUseCases();
  await assert.rejects(() => useCases.getProfile('missing-id'));
});
