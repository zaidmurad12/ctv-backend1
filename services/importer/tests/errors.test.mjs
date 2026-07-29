import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportError, ImportFailureCategoryEnum } from '../dist/index.js';

test('ImportError carries category, stage, and message', () => {
  const error = new ImportError(
    ImportFailureCategoryEnum.VALIDATION_ERROR,
    'movie-import',
    'Title is required.',
  );

  assert.equal(error.name, 'ImportError');
  assert.equal(error.category, ImportFailureCategoryEnum.VALIDATION_ERROR);
  assert.equal(error.stage, 'movie-import');
  assert.equal(error.message, 'Title is required.');
  assert.ok(error instanceof Error);
});
