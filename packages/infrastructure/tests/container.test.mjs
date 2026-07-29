import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../dist/index.js';

test('container resolves the same singleton instance on every call', () => {
  const container = createContainer();
  let instances = 0;
  container.registerSingleton('counter', () => {
    instances += 1;
    return { value: instances };
  });

  const first = container.resolve('counter');
  const second = container.resolve('counter');

  assert.equal(instances, 1);
  assert.equal(first, second);
});

test('container creates a fresh instance per resolve for transient registrations', () => {
  const container = createContainer();
  let instances = 0;
  container.registerTransient('worker', () => {
    instances += 1;
    return { value: instances };
  });

  const first = container.resolve('worker');
  const second = container.resolve('worker');

  assert.equal(instances, 2);
  assert.notEqual(first, second);
});

test('container throws when resolving an unregistered service', () => {
  const container = createContainer();

  assert.throws(() => container.resolve('missing'), /not registered/);
});
