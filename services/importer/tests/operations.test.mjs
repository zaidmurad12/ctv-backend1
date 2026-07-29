import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeadLetterQueue,
  ImportFailureCategoryEnum,
  ImportLogger,
  ImportMetrics,
  JobRetryPolicy,
} from '../dist/index.js';

const retryConfig = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

test('JobRetryPolicy retries transient categories with growing backoff', () => {
  const policy = new JobRetryPolicy(retryConfig);

  assert.equal(policy.decide(ImportFailureCategoryEnum.TIMEOUT, 1).shouldRetry, true);
  assert.equal(policy.decide(ImportFailureCategoryEnum.TIMEOUT, 1).delayMs, 100);
  assert.equal(policy.decide(ImportFailureCategoryEnum.TIMEOUT, 2).delayMs, 200);
});

test('JobRetryPolicy never retries a validation error', () => {
  const policy = new JobRetryPolicy(retryConfig);
  assert.equal(policy.decide(ImportFailureCategoryEnum.VALIDATION_ERROR, 1).shouldRetry, false);
});

test('JobRetryPolicy stops once maxAttempts is reached', () => {
  const policy = new JobRetryPolicy(retryConfig);
  assert.equal(policy.decide(ImportFailureCategoryEnum.TIMEOUT, 3).shouldRetry, false);
});

test('DeadLetterQueue stores, lists, and removes entries', () => {
  const dlq = new DeadLetterQueue();
  dlq.add('job-1', { providerId: 'cinemana' }, 'Validation failed', 1);

  assert.equal(dlq.size, 1);
  assert.equal(dlq.get('job-1').error, 'Validation failed');
  assert.equal(dlq.list().length, 1);

  dlq.remove('job-1');
  assert.equal(dlq.size, 0);
  assert.equal(dlq.get('job-1'), null);
});

test('ImportMetrics accumulates counters and computes an average import duration', () => {
  const metrics = new ImportMetrics();
  metrics.recordMovieImported();
  metrics.recordShowImported();
  metrics.recordEpisodesImported(3);
  metrics.recordStreamsImported(5);
  metrics.recordSubtitlesImported(2);
  metrics.recordFailure();
  metrics.recordRetry();
  metrics.recordImportDuration(100);
  metrics.recordImportDuration(200);

  const snapshot = metrics.snapshot();

  assert.equal(snapshot.moviesImported, 1);
  assert.equal(snapshot.showsImported, 1);
  assert.equal(snapshot.episodesImported, 3);
  assert.equal(snapshot.streamsImported, 5);
  assert.equal(snapshot.subtitlesImported, 2);
  assert.equal(snapshot.failedImports, 1);
  assert.equal(snapshot.retriedImports, 1);
  assert.equal(snapshot.averageImportTimeMs, 150);
});

test('ImportMetrics reports a zero average when nothing has completed yet', () => {
  assert.equal(new ImportMetrics().snapshot().averageImportTimeMs, 0);
});

test('ImportLogger logs success and failure through the underlying logger with structured fields', () => {
  const calls = [];
  const logger = {
    debug: () => {},
    info: (message, meta) => calls.push(['info', message, meta]),
    warn: () => {},
    error: (message, meta) => calls.push(['error', message, meta]),
  };
  const importLogger = new ImportLogger(logger);

  importLogger.logStage({
    jobId: 'j1',
    providerId: 'cinemana',
    stage: 'discovery',
    durationMs: 10,
    status: 'success',
  });
  importLogger.logStage({
    jobId: 'j2',
    providerId: 'cinemana',
    stage: 'movie-import',
    durationMs: 5,
    status: 'failure',
    error: 'boom',
  });

  assert.equal(calls[0][0], 'info');
  assert.equal(calls[0][2].jobId, 'j1');
  assert.equal(calls[1][0], 'error');
  assert.equal(calls[1][2].error, 'boom');
});
