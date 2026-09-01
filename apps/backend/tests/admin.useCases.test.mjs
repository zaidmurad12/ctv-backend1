import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../dist/auth/domain/user.js';
import { AdminUsersUseCases, ProvidersUseCases } from '../dist/admin/useCases.js';
import { ProvidersRuntime } from '../dist/providers/providersRuntime.js';

function fakeRegistryRepository() {
  return {
    findBySlug: async () => null,
    syncDefaults: async () => undefined,
    setEnabled: async () => undefined,
    setPriority: async () => undefined,
    touchLastSync: async () => undefined,
  };
}

function fakeMetrics() {
  return { recordSuccess: () => {}, recordFailure: () => {}, successRate: () => null };
}

function buildProvidersUseCases() {
  return new ProvidersUseCases(new ProvidersRuntime(), fakeRegistryRepository(), fakeMetrics());
}

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

test('ProvidersUseCases.list returns an empty array when no provider is registered', async () => {
  const useCases = buildProvidersUseCases();
  assert.deepEqual(await useCases.list(), []);
});

test('ProvidersUseCases.triggerDiscovery throws for an unregistered provider', async () => {
  const useCases = buildProvidersUseCases();
  await assert.rejects(() => useCases.triggerDiscovery('cinemana'));
});

test('ProvidersUseCases.health returns an empty snapshot list when nothing is registered', async () => {
  const useCases = buildProvidersUseCases();
  assert.deepEqual(await useCases.health(), []);
});

test('ProvidersUseCases.setEnabled/setPriority throw for an unregistered provider', async () => {
  const useCases = buildProvidersUseCases();
  await assert.rejects(() => useCases.setEnabled('cinemana', false));
  await assert.rejects(() => useCases.setPriority('cinemana', 1));
});
