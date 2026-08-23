import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderConfig, ProviderCapabilityEnum, ProviderErrorCodeEnum } from '@ctv-platform/sdk';
import { ConsumetHttpError, ConsumetProvider, buildConsumetMetadata, ConsumetConsoleLogger } from '../dist/index.js';

const fastConfig = createProviderConfig({ retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } });
const silentLogger = new ConsumetConsoleLogger('error');

function buildProvider(contentOverrides = {}) {
  const content = {
    search: async () => ({ items: [], totalCount: 0 }),
    discover: async () => [],
    movie: async () => ({ providerMovieId: 'm::m', title: 'M', isAvailable: true, artwork: {}, streams: [], subtitles: [] }),
    show: async () => ({ providerShowId: 's', title: 'S', isAvailable: true, artwork: {}, seasons: [] }),
    season: async () => null,
    episode: async () => null,
    streams: async () => [],
    subtitles: async () => [],
    ...contentOverrides,
  };
  return new ConsumetProvider(buildConsumetMetadata(50), fastConfig, silentLogger, content);
}

test('declares every content capability but never METADATA_ENRICHMENT', () => {
  const provider = buildProvider();
  for (const capability of [
    ProviderCapabilityEnum.SEARCH,
    ProviderCapabilityEnum.DISCOVERY,
    ProviderCapabilityEnum.MOVIE_DETAILS,
    ProviderCapabilityEnum.SHOW_DETAILS,
    ProviderCapabilityEnum.SEASON_DETAILS,
    ProviderCapabilityEnum.EPISODE_DETAILS,
    ProviderCapabilityEnum.STREAMS,
    ProviderCapabilityEnum.SUBTITLES,
  ]) {
    assert.equal(provider.supports(capability), true, `expected to support ${capability}`);
  }
  assert.equal(provider.supports(ProviderCapabilityEnum.METADATA_ENRICHMENT), false);
});

test('health() succeeds when the content service resolves', async () => {
  const provider = buildProvider({ discover: async () => [{ providerContentId: '1' }] });
  const result = await provider.health();
  assert.equal(result.ok, true);
  assert.equal(result.value.status, 'HEALTHY');
});

test('health() maps a network failure to UNAVAILABLE-worthy ProviderError, not a thrown exception', async () => {
  const provider = buildProvider({
    discover: async () => {
      throw new ConsumetHttpError('network', 'boom');
    },
  });
  const result = await provider.health();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ProviderErrorCodeEnum.UNKNOWN_ERROR);
});

test('doMovie maps a 404 ConsumetHttpError to NOT_FOUND', async () => {
  const provider = buildProvider({
    movie: async () => {
      throw new ConsumetHttpError('http', 'missing', 404);
    },
  });
  const result = await provider.movie('missing::missing');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ProviderErrorCodeEnum.NOT_FOUND);
  assert.equal(result.error.providerId, 'consumet');
});

test('doStreams surfaces a successful mapped result', async () => {
  const provider = buildProvider({
    streams: async () => [{ providerStreamId: '0', quality: '1080p', serverName: 'consumet', playbackUrl: 'https://x' }],
  });
  const result = await provider.streams('m::e');
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].playbackUrl, 'https://x');
});

test('doDiscover returns an empty result for categories with no known Consumet route, instead of erroring', async () => {
  const provider = buildProvider();
  const result = await provider.discover({ category: 'collections' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { items: [], totalCount: 0 });
});

test('a 429 is mapped to RATE_LIMITED', async () => {
  const provider = buildProvider({
    search: async () => {
      throw new ConsumetHttpError('http', 'slow down', 429);
    },
  });
  const result = await provider.search({ term: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ProviderErrorCodeEnum.RATE_LIMITED);
});
