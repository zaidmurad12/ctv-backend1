import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../dist/auth/domain/user.js';
import { UsersUseCases } from '../dist/users/useCases.js';

function fakeUserRepository(seed) {
  const users = [seed];
  return {
    users,
    save: async (user) => {
      const index = users.findIndex((existing) => existing.id === user.id);
      if (index >= 0) users[index] = user;
      else users.push(user);
    },
    findById: async (id) => users.find((user) => user.id === id) ?? null,
    findByEmail: async () => null,
    findByUsername: async (username) => users.find((user) => user.username.value === username) ?? null,
    list: async () => ({ items: users, total: users.length }),
  };
}

function fakeHasher(currentPasswordPlain) {
  return {
    hash: async (plain) => `hashed:${plain}`,
    verify: async (plain) => plain === currentPasswordPlain,
  };
}

test('updateProfile changes the username when available', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const users = fakeUserRepository(user);
  const useCases = new UsersUseCases(users, fakeHasher('secret'));

  const updated = await useCases.updateProfile('u1', { username: 'alice2' });

  assert.equal(updated.username.value, 'alice2');
});

test('updateProfile rejects a username already taken by someone else', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const other = User.create({ id: 'u2', email: 'c@d.com', username: 'bob', passwordHash: 'x', role: 'VIEWER' });
  const users = fakeUserRepository(user);
  users.users.push(other);
  const useCases = new UsersUseCases(users, fakeHasher('secret'));

  await assert.rejects(() => useCases.updateProfile('u1', { username: 'bob' }));
});

test('changePassword rejects an incorrect current password', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const users = fakeUserRepository(user);
  const useCases = new UsersUseCases(users, fakeHasher('correct-current'));

  await assert.rejects(() => useCases.changePassword('u1', { currentPassword: 'wrong', newPassword: 'Sup3r-Secret!!' }));
});

test('changePassword rejects a weak new password', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const users = fakeUserRepository(user);
  const useCases = new UsersUseCases(users, fakeHasher('correct-current'));

  await assert.rejects(() => useCases.changePassword('u1', { currentPassword: 'correct-current', newPassword: 'short' }));
});

test('changePassword succeeds and stores the new hash', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const users = fakeUserRepository(user);
  const useCases = new UsersUseCases(users, fakeHasher('correct-current'));

  await useCases.changePassword('u1', { currentPassword: 'correct-current', newPassword: 'Sup3r-Secret!!' });

  assert.equal(users.users[0].passwordHash, 'hashed:Sup3r-Secret!!');
});
