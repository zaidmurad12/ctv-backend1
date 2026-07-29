import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportPipelineConfig } from '../dist/index.js';

test('createImportPipelineConfig fills in documented defaults', () => {
  const config = createImportPipelineConfig();

  assert.equal(config.batchSize, 50);
  assert.equal(config.concurrency, 5);
  assert.equal(config.discoveryIntervalMs, 24 * 60 * 60 * 1000);
  assert.equal(config.maxJobAttempts, 3);
  assert.equal(config.fuzzyMatchThreshold, 0.9);
});

test('createImportPipelineConfig honors overrides', () => {
  const config = createImportPipelineConfig({
    batchSize: 10,
    concurrency: 2,
    fuzzyMatchThreshold: 0.75,
  });

  assert.equal(config.batchSize, 10);
  assert.equal(config.concurrency, 2);
  assert.equal(config.fuzzyMatchThreshold, 0.75);
});

test('createImportPipelineConfig rejects an out-of-range fuzzy threshold', () => {
  assert.throws(() => createImportPipelineConfig({ fuzzyMatchThreshold: 1.5 }));
});
