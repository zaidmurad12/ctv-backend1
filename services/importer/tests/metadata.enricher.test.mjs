import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import { ContentMatcher, MetadataEnricher } from '../dist/index.js';

function fakeMetadataProvider({ id, searchItems, movieDetail }) {
  return {
    metadata: { id, name: id },
    search: async () => ok({ items: searchItems, totalCount: searchItems.length }),
    movie: async (candidateId) =>
      candidateId === movieDetail?.providerMovieId
        ? ok(movieDetail)
        : err({ code: 'NOT_FOUND', message: 'missing' }),
    show: async () => err({ code: 'NOT_FOUND', message: 'missing' }),
  };
}

const enricher = new MetadataEnricher(new ContentMatcher(0.9));

test('enrichMovie downloads full details for the best search match', async () => {
  const provider = fakeMetadataProvider({
    id: 'tmdb',
    searchItems: [{ providerContentId: 'tmdb-42', kind: 'movie', title: 'Arrival', artwork: {} }],
    movieDetail: {
      providerMovieId: 'tmdb-42',
      title: 'Arrival',
      overview: 'Rich overview',
      isAvailable: true,
      artwork: {},
      streams: [],
      subtitles: [],
    },
  });

  const enriched = await enricher.enrichMovie(
    {
      providerMovieId: 'c1',
      title: 'Arrival',
      isAvailable: true,
      artwork: {},
      streams: [],
      subtitles: [],
    },
    [provider],
  );

  assert.equal(enriched.overview, 'Rich overview');
});

test('enrichMovie returns null when no metadata provider has a confident match', async () => {
  const provider = fakeMetadataProvider({ id: 'tmdb', searchItems: [], movieDetail: null });

  const enriched = await enricher.enrichMovie(
    {
      providerMovieId: 'c1',
      title: 'Some Obscure Title',
      isAvailable: true,
      artwork: {},
      streams: [],
      subtitles: [],
    },
    [provider],
  );

  assert.equal(enriched, null);
});

test('enrichMovie tries the next provider when the first finds no match', async () => {
  const noMatchProvider = fakeMetadataProvider({ id: 'p1', searchItems: [], movieDetail: null });
  const matchProvider = fakeMetadataProvider({
    id: 'p2',
    searchItems: [{ providerContentId: 'p2-1', kind: 'movie', title: 'Arrival', artwork: {} }],
    movieDetail: {
      providerMovieId: 'p2-1',
      title: 'Arrival',
      overview: 'From p2',
      isAvailable: true,
      artwork: {},
      streams: [],
      subtitles: [],
    },
  });

  const enriched = await enricher.enrichMovie(
    {
      providerMovieId: 'c1',
      title: 'Arrival',
      isAvailable: true,
      artwork: {},
      streams: [],
      subtitles: [],
    },
    [noMatchProvider, matchProvider],
  );

  assert.equal(enriched.overview, 'From p2');
});
