import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReleaseYear,
  normalizeArabicTitle,
  normalizeTitle,
  normalizeWhitespace,
} from '../dist/index.js';

test('normalizeWhitespace trims and collapses internal whitespace', () => {
  assert.equal(normalizeWhitespace('  Arrival    (2016)  '), 'Arrival (2016)');
});

test('normalizeTitle lowercases and normalizes unicode', () => {
  assert.equal(normalizeTitle('  Arrival  '), 'arrival');
});

test('normalizeArabicTitle strips diacritics and tatweel', () => {
  const withDiacritics = 'مُحَمَّدٌ';
  const withoutDiacritics = normalizeArabicTitle(withDiacritics);

  assert.equal(withoutDiacritics, 'محمد');
});

test('normalizeArabicTitle unifies interchangeable alef/yaa/taa-marbuta variants', () => {
  assert.equal(normalizeArabicTitle('إثارة'), normalizeArabicTitle('اثاره'));
  assert.equal(normalizeArabicTitle('أفلام'), normalizeArabicTitle('افلام'));
});

test('extractReleaseYear reads the leading 4 digits of an ISO date', () => {
  assert.equal(extractReleaseYear('2016-11-11'), 2016);
});

test('extractReleaseYear returns undefined for a missing date', () => {
  assert.equal(extractReleaseYear(undefined), undefined);
});
