import test from 'node:test';
import assert from 'node:assert/strict';
import { titleSimilarity } from '../dist/index.js';

test('identical strings have a similarity of 1', () => {
  assert.equal(titleSimilarity('arrival', 'arrival'), 1);
});

test('two empty strings are considered identical', () => {
  assert.equal(titleSimilarity('', ''), 1);
});

test('completely different strings have a low similarity', () => {
  assert.ok(titleSimilarity('arrival', 'zzzzzzz') < 0.3);
});

test('a single-character difference yields high similarity for long strings', () => {
  assert.ok(titleSimilarity('interstellar', 'interstellai') > 0.9);
});
