import test from 'node:test';
import assert from 'node:assert/strict';
import { processInBatches, ProgressTracker } from '../dist/index.js';

test('ProgressTracker tracks success/failure counts and percentage', () => {
  const tracker = new ProgressTracker(4);
  tracker.setStage('discovery');
  tracker.recordSuccess();
  tracker.recordSuccess();
  tracker.recordFailure();

  const snapshot = tracker.snapshot();

  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.processed, 3);
  assert.equal(snapshot.succeeded, 2);
  assert.equal(snapshot.failed, 1);
  assert.equal(snapshot.currentStage, 'discovery');
  assert.equal(snapshot.percentage, 75);
  assert.equal(snapshot.finishedAt, null);
});

test('ProgressTracker.finish records a finish time and a run with zero items reports 100%', () => {
  const tracker = new ProgressTracker(0);
  tracker.finish();

  const snapshot = tracker.snapshot();
  assert.ok(snapshot.finishedAt instanceof Date);
  assert.equal(snapshot.percentage, 100);
});

test('processInBatches preserves result order regardless of completion order', async () => {
  const results = await processInBatches([30, 10, 20], 3, async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  });

  assert.deepEqual(results, [30, 10, 20]);
});

test('processInBatches never runs more than `concurrency` handlers at once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  await processInBatches([1, 2, 3, 4, 5, 6], 2, async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return item;
  });

  assert.ok(maxInFlight <= 2);
});
