import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../dist/auth/domain/user.js';
import { AdminUsersUseCases, ProvidersUseCases } from '../dist/admin/useCases.js';
import { ProvidersRuntime } from '../dist/admin/infrastructure/providersRuntime.js';

test('AdminUsersUseCases.updateUser changes role and active status', async () => {
  const user = User.create({ id: 'u1', email: 'a@b.com', username: 'alice', passwordHash: 'x', role: 'VIEWER' });
  const users = { findById: async () => user, save: async () => {} };
  const useCases = new AdminUsersUseCases(users);

  const updated = await useCases.updateUser('u1', { role: 'ADMIN', isActive: false });

  assert.equal(updated.role, 'ADMIN');
  assert.equal(updated.isActive, false);
});

test('AdminUsersUseCases.updateUser throws NotFoundError for an unknown user', async () => {
  const users = { findById: async () => null, save: async () => {} };
  const useCases = new AdminUsersUseCases(users);
  await assert.rejects(() => useCases.updateUser('missing', {}));
});

test('ProvidersUseCases.list returns an empty array when no provider is registered', () => {
  const useCases = new ProvidersUseCases(new ProvidersRuntime());
  assert.deepEqual(useCases.list(), []);
});

test('ProvidersUseCases.triggerDiscovery throws for an unregistered provider', async () => {
  const useCases = new ProvidersUseCases(new ProvidersRuntime());
  await assert.rejects(() => useCases.triggerDiscovery('cinemana'));
});

test('ProvidersUseCases.health returns an empty snapshot list when nothing is registered', async () => {
  const useCases = new ProvidersUseCases(new ProvidersRuntime());
  assert.deepEqual(await useCases.health(), []);
});
