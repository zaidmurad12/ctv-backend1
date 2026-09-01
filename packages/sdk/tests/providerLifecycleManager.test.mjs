import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import {
  ProviderError,
  ProviderErrorCodeEnum,
  ProviderLifecycleManager,
  ProviderRegistry,
  ProviderStatusEnum,
} from '../dist/index.js';

function fakeProvider(id, priority, healthResult) {
  return {
    metadata: {
      id,
      name: id,
      version: '1.0.0',
      apiVersion: '1',
      minimumSupportedVersion: '1',
      priority,
      capabilities: [],
    },
    supports: () => false,
    health: async () => healthResult,
  };
}

function fakeLogger() {
  const calls = [];
  const record = (level) => (message, meta) => calls.push({ level, message, meta });
  return {
    calls,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

test('initialize() records a healthy snapshot from a successful health check', async () => {
  const registry = new ProviderRegistry();
  const checkedAt = new Date('2024-01-01T00:00:00.000Z');
  registry.register(
    fakeProvider(
      'cinemana',
      1,
      ok({ status: ProviderStatusEnum.HEALTHY, latencyMs: 42, version: '1.0.0', checkedAt }),
    ),
  );
  const manager = new ProviderLifecycleManager(registry, fakeLogger());

  const snapshots = await manager.initialize();

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].providerId, 'cinemana');
  assert.equal(snapshots[0].status, ProviderStatusEnum.HEALTHY);
  assert.equal(snapshots[0].latencyMs, 42);
});

test('initialize() downgrades a failed health check to UNAVAILABLE', async () => {
  const registry = new ProviderRegistry();
  registry.register(
    fakeProvider(
      'cinemana',
      1,
      err(new ProviderError(ProviderErrorCodeEnum.TIMEOUT, 'cinemana', 'no response')),
    ),
  );
  const manager = new ProviderLifecycleManager(registry, fakeLogger());

  const [snapshot] = await manager.initialize();

  assert.equal(snapshot.status, ProviderStatusEnum.UNAVAILABLE);
  assert.equal(snapshot.message, 'no response');
});

test('getSnapshot/listSnapshots reflect the most recent check', async () => {
  const registry = new ProviderRegistry();
  registry.register(
    fakeProvider(
      'tmdb',
      2,
      ok({
        status: ProviderStatusEnum.HEALTHY,
        latencyMs: 10,
        version: '1.0.0',
        checkedAt: new Date(),
      }),
    ),
  );
  const manager = new ProviderLifecycleManager(registry, fakeLogger());

  assert.equal(manager.getSnapshot('tmdb'), null);
  await manager.initialize();

  assert.equal(manager.getSnapshot('tmdb').providerId, 'tmdb');
  assert.equal(manager.listSnapshots().length, 1);
});

test('refresh() re-checks a single provider by id', async () => {
  const registry = new ProviderRegistry();
  let calls = 0;
  registry.register({
    metadata: {
      id: 'cinemana',
      name: 'cinemana',
      version: '1',
      apiVersion: '1',
      minimumSupportedVersion: '1',
      priority: 1,
      capabilities: [],
    },
    supports: () => false,
    health: async () => {
      calls += 1;
      return ok({
        status: ProviderStatusEnum.HEALTHY,
        latencyMs: 1,
        version: '1',
        checkedAt: new Date(),
      });
    },
  });
  const manager = new ProviderLifecycleManager(registry, fakeLogger());

  await manager.refresh('cinemana');
  await manager.refresh('cinemana');

  assert.equal(calls, 2);
});
