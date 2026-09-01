import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMovieMetadata, mergeShowMetadata } from '../dist/index.js';

const baseMovie = {
  providerMovieId: 'm1',
  title: 'Arrival',
  overview: 'Provider overview',
  isAvailable: true,
  artwork: { poster: 'https://provider.example/poster.jpg' },
  streams: [
    {
      providerStreamId: 's1',
      quality: '1080p',
      serverName: 'A',
      playbackUrl: 'https://provider.example/s1',
    },
  ],
  subtitles: [],
};

test('mergeMovieMetadata returns the base unchanged when there is no enrichment', () => {
  const merged = mergeMovieMetadata(baseMovie, null);
  assert.equal(merged, baseMovie);
});

test('mergeMovieMetadata lets the enrichment source win for overview/artwork', () => {
  const enrichment = {
    providerMovieId: 'tmdb-1',
    title: 'Arrival (TMDB title, ignored)',
    overview: 'TMDB overview',
    isAvailable: false,
    artwork: {
      poster: 'https://tmdb.example/poster.jpg',
      backdrop: 'https://tmdb.example/backdrop.jpg',
    },
    streams: [],
    subtitles: [],
  };

  const merged = mergeMovieMetadata(baseMovie, enrichment);

  assert.equal(merged.overview, 'TMDB overview');
  assert.equal(merged.artwork.poster, 'https://tmdb.example/poster.jpg');
  assert.equal(merged.artwork.backdrop, 'https://tmdb.example/backdrop.jpg');
});

test('mergeMovieMetadata never lets enrichment override availability or streams/subtitles', () => {
  const enrichment = {
    providerMovieId: 'tmdb-1',
    title: 'Arrival',
    isAvailable: false,
    artwork: {},
    streams: [
      {
        providerStreamId: 'fake',
        quality: '4k',
        serverName: 'TMDB',
        playbackUrl: 'https://tmdb.example/s',
      },
    ],
    subtitles: [],
  };

  const merged = mergeMovieMetadata(baseMovie, enrichment);

  assert.equal(merged.isAvailable, true);
  assert.deepEqual(merged.streams, baseMovie.streams);
});

test('mergeMovieMetadata keeps the base artwork field when enrichment has none', () => {
  const merged = mergeMovieMetadata(baseMovie, {
    providerMovieId: 'tmdb-1',
    title: 'Arrival',
    isAvailable: true,
    artwork: {},
    streams: [],
    subtitles: [],
  });

  assert.equal(merged.artwork.poster, baseMovie.artwork.poster);
});

test('mergeShowMetadata merges overview/artwork the same way as movies', () => {
  const baseShow = {
    providerShowId: 'sh1',
    title: 'Severance',
    isAvailable: true,
    artwork: { poster: 'https://provider.example/p.jpg' },
    seasons: [],
  };

  const merged = mergeShowMetadata(baseShow, {
    providerShowId: 'tmdb-1',
    title: 'Severance',
    overview: 'TMDB overview',
    isAvailable: true,
    artwork: { backdrop: 'https://tmdb.example/b.jpg' },
    seasons: [],
  });

  assert.equal(merged.overview, 'TMDB overview');
  assert.equal(merged.artwork.poster, 'https://provider.example/p.jpg');
  assert.equal(merged.artwork.backdrop, 'https://tmdb.example/b.jpg');
});
