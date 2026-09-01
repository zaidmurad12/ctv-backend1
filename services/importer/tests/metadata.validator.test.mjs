import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEnrichmentFields,
  validateMovieMetadata,
  validateShowMetadata,
} from '../dist/index.js';

test('validateMovieMetadata accepts a well-formed DTO', () => {
  const report = validateMovieMetadata({
    providerMovieId: 'm1',
    title: 'Arrival',
    isAvailable: true,
    artwork: { poster: 'https://example.com/poster.jpg' },
    streams: [],
    subtitles: [],
  });

  assert.equal(report.valid, true);
  assert.deepEqual(report.issues, []);
});

test('validateMovieMetadata rejects an empty title', () => {
  const report = validateMovieMetadata({
    providerMovieId: 'm1',
    title: '   ',
    isAvailable: true,
    artwork: {},
    streams: [],
    subtitles: [],
  });

  assert.equal(report.valid, false);
  assert.equal(report.issues[0].field, 'title');
});

test('validateMovieMetadata rejects a non-absolute artwork URL', () => {
  const report = validateMovieMetadata({
    providerMovieId: 'm1',
    title: 'Arrival',
    isAvailable: true,
    artwork: { poster: '/relative/poster.jpg' },
    streams: [],
    subtitles: [],
  });

  assert.equal(report.valid, false);
  assert.equal(report.issues[0].field, 'artwork.poster');
});

test('validateShowMetadata rejects an empty title', () => {
  const report = validateShowMetadata({
    providerShowId: 's1',
    title: '',
    isAvailable: true,
    artwork: {},
    seasons: [],
  });

  assert.equal(report.valid, false);
});

test('extractEnrichmentFields reads rating/runtime/trailer from the raw passthrough field', () => {
  const fields = extractEnrichmentFields({
    providerMovieId: 'm1',
    title: 'Arrival',
    isAvailable: true,
    artwork: {},
    streams: [],
    subtitles: [],
    raw: { rating: 7.9, runtimeMinutes: 116, trailerUrl: 'https://example.com/trailer.mp4' },
  });

  assert.equal(fields.rating, 7.9);
  assert.equal(fields.runtimeMinutes, 116);
  assert.equal(fields.trailerUrl, 'https://example.com/trailer.mp4');
});

test('extractEnrichmentFields returns undefined fields when raw is absent', () => {
  const fields = extractEnrichmentFields({
    providerMovieId: 'm1',
    title: 'Arrival',
    isAvailable: true,
    artwork: {},
    streams: [],
    subtitles: [],
  });

  assert.equal(fields.rating, undefined);
  assert.equal(fields.runtimeMinutes, undefined);
  assert.equal(fields.trailerUrl, undefined);
});
