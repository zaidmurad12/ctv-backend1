import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentMatcher } from '../dist/index.js';

const matcher = new ContentMatcher(0.9);

test('matches by IMDb id first when present', () => {
  const candidates = [
    { id: 'wrong', title: 'Something Else', imdbId: 'tt000' },
    { id: 'right', title: 'Different Title', imdbId: 'tt123', tmdbId: '999' },
  ];

  const outcome = matcher.match(
    { title: 'Arrival', identifiers: { imdbId: 'tt123', tmdbId: '999' } },
    candidates,
  );

  assert.equal(outcome.matched, true);
  assert.equal(outcome.candidate.id, 'right');
  assert.equal(outcome.method, 'imdb_id');
});

test('falls back to TMDB id when no IMDb id is present', () => {
  const candidates = [{ id: 'match', title: 'Anything', tmdbId: '42' }];

  const outcome = matcher.match({ title: 'X', identifiers: { tmdbId: '42' } }, candidates);

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'tmdb_id');
});

test('falls back to exact original title + year', () => {
  const candidates = [
    { id: 'match', title: 'Different', originalTitle: 'Original Title', releaseYear: 2020 },
  ];

  const outcome = matcher.match(
    { title: 'Different', identifiers: { originalTitle: 'Original Title', releaseYear: 2020 } },
    candidates,
  );

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'exact_original_title');
});

test('falls back to exact title + year when no original title is known', () => {
  const candidates = [{ id: 'match', title: 'Arrival', releaseYear: 2016 }];

  const outcome = matcher.match(
    { title: 'Arrival', identifiers: { releaseYear: 2016 } },
    candidates,
  );

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'exact_title');
});

test('a year mismatch prevents an exact-title match, even though the same title still clears fuzzy', () => {
  const candidates = [{ id: 'match', title: 'Arrival', releaseYear: 1997 }];

  const outcome = matcher.match(
    { title: 'Arrival', identifiers: { releaseYear: 2016 } },
    candidates,
  );

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'fuzzy');
});

test('matches normalized Arabic titles ignoring diacritics and alef variants', () => {
  const candidates = [{ id: 'match', title: 'أفلام إثارة', releaseYear: 2021 }];

  const outcome = matcher.match(
    { title: 'افلام اثاره', identifiers: { releaseYear: 2021 } },
    candidates,
  );

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'normalized_arabic_title');
});

test('falls back to fuzzy matching above the configured threshold', () => {
  const candidates = [{ id: 'match', title: 'Interstellar' }];

  const outcome = matcher.match({ title: 'Interstelar', identifiers: {} }, candidates);

  assert.equal(outcome.matched, true);
  assert.equal(outcome.method, 'fuzzy');
  assert.ok(outcome.confidence >= 0.9);
});

test('reports no match when nothing clears the fuzzy threshold', () => {
  const candidates = [{ id: 'a', title: 'Completely Unrelated Title' }];

  const outcome = matcher.match({ title: 'Arrival', identifiers: {} }, candidates);

  assert.equal(outcome.matched, false);
});

test('picks the highest-similarity candidate when several clear the fuzzy threshold', () => {
  const candidates = [
    { id: 'close', title: 'Intersteller' },
    { id: 'exact', title: 'Interstellar' },
  ];

  const outcome = matcher.match({ title: 'Interstellar', identifiers: {} }, candidates);

  assert.equal(outcome.matched, true);
  assert.equal(outcome.candidate.id, 'exact');
});
