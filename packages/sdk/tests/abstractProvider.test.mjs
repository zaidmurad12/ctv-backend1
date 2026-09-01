import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import {
  AbstractProvider,
  createProviderConfig,
  ProviderCapabilityEnum,
  ProviderError,
  ProviderErrorCodeEnum,
  ProviderStatusEnum,
} from '../dist/index.js';

function metadata(overrides = {}) {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    version: '1.0.0',
    apiVersion: '1',
    minimumSupportedVersion: '1',
    priority: 1,
    capabilities: [],
    ...overrides,
  };
}

function fakeLogger() {
  const calls = [];
  const record = (level) => (message, meta) => calls.push({ level, message, meta });
  return {
    calls,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

class TestProvider extends AbstractProvider {
  constructor(providerMetadata, config, logger, deps, behavior) {
    super(providerMetadata, config, logger, deps);
    this.behavior = behavior;
    this.movieCalls = 0;
  }

  doHealth() {
    return this.behavior.health();
  }

  doDiscover(query) {
    return this.behavior.discover(query);
  }

  doSearch(query) {
    return this.behavior.search(query);
  }

  doMovie(id) {
    this.movieCalls += 1;
    return this.behavior.movie(id);
  }

  doShow(id) {
    return this.behavior.show(id);
  }

  doSeason(showId, seasonNumber) {
    return this.behavior.season(showId, seasonNumber);
  }

  doEpisode(showId, seasonNumber, episodeNumber) {
    return this.behavior.episode(showId, seasonNumber, episodeNumber);
  }

  doStreams(id) {
    return this.behavior.streams(id);
  }

  doSubtitles(id) {
    return this.behavior.subtitles(id);
  }
}

const fastConfig = createProviderConfig({
  retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
});
const healthyResult = ok({
  status: ProviderStatusEnum.HEALTHY,
  latencyMs: 5,
  version: '1.0.0',
  checkedAt: new Date(),
});

test('rejects calls for capabilities the provider does not advertise', async () => {
  const provider = new TestProvider(
    metadata({ capabilities: [] }),
    fastConfig,
    fakeLogger(),
    {},
    {
      movie: async () => ok('should not be reached'),
    },
  );

  const result = await provider.movie('m1');

  assert.equal(result.ok, false);
  assert.equal(result.error.code, ProviderErrorCodeEnum.NOT_SUPPORTED);
  assert.equal(provider.movieCalls, 0);
});

test('health() is callable even when no capabilities are advertised', async () => {
  const provider = new TestProvider(
    metadata({ capabilities: [] }),
    fastConfig,
    fakeLogger(),
    {},
    {
      health: async () => healthyResult,
    },
  );

  const result = await provider.health();

  assert.deepEqual(result, healthyResult);
});

test('a supported capability delegates to the concrete provider and logs completion', async () => {
  const logger = fakeLogger();
  const provider = new TestProvider(
    metadata({ capabilities: [ProviderCapabilityEnum.MOVIE_DETAILS] }),
    fastConfig,
    logger,
    {},
    { movie: async () => ok({ providerMovieId: 'm1' }) },
  );

  const result = await provider.movie('m1');

  assert.equal(result.ok, true);
  assert.equal(provider.movieCalls, 1);
  assert.ok(
    logger.calls.some((call) => call.level === 'info' && call.message.includes('completed')),
  );
});

test('retries a transient failure and eventually succeeds', async () => {
  let attempts = 0;
  const provider = new TestProvider(
    metadata({ capabilities: [ProviderCapabilityEnum.MOVIE_DETAILS] }),
    fastConfig,
    fakeLogger(),
    {},
    {
      movie: async () => {
        attempts += 1;
        if (attempts < 3) {
          return err(
            new ProviderError(ProviderErrorCodeEnum.TIMEOUT, 'test-provider', 'timed out'),
          );
        }
        return ok({ providerMovieId: 'm1' });
      },
    },
  );

  const result = await provider.movie('m1');

  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
});

test('reports rate limiting to the injected rate limiter and honors retryAfterMs', async () => {
  const reportedCooldowns = [];
  const rateLimiter = {
    acquire: async () => {},
    reportRateLimited: (cooldownMs) => reportedCooldowns.push(cooldownMs),
  };
  let attempts = 0;
  const provider = new TestProvider(
    metadata({ capabilities: [ProviderCapabilityEnum.MOVIE_DETAILS] }),
    fastConfig,
    fakeLogger(),
    { rateLimiter },
    {
      movie: async () => {
        attempts += 1;
        if (attempts === 1) {
          return err(
            new ProviderError(ProviderErrorCodeEnum.RATE_LIMITED, 'test-provider', 'slow down', {
              retryAfterMs: 250,
            }),
          );
        }
        return ok({ providerMovieId: 'm1' });
      },
    },
  );

  const result = await provider.movie('m1');

  assert.equal(result.ok, true);
  assert.deepEqual(reportedCooldowns, [250]);
});

test('refreshes authentication once before retrying an UNAUTHORIZED failure', async () => {
  let authenticateCalls = 0;
  const authenticationStrategy = {
    authenticate: async () => {
      authenticateCalls += 1;
      return ok(null);
    },
    isExpired: () => false,
  };
  let attempts = 0;
  const provider = new TestProvider(
    metadata({ capabilities: [ProviderCapabilityEnum.MOVIE_DETAILS] }),
    fastConfig,
    fakeLogger(),
    { authenticationStrategy },
    {
      movie: async () => {
        attempts += 1;
        if (attempts === 1) {
          return err(
            new ProviderError(ProviderErrorCodeEnum.UNAUTHORIZED, 'test-provider', 'expired'),
          );
        }
        return ok({ providerMovieId: 'm1' });
      },
    },
  );

  const result = await provider.movie('m1');

  assert.equal(result.ok, true);
  assert.equal(authenticateCalls, 1);
});

test('supports() reflects the advertised capability list', () => {
  const provider = new TestProvider(
    metadata({ capabilities: [ProviderCapabilityEnum.STREAMS] }),
    fastConfig,
    fakeLogger(),
    {},
    {},
  );

  assert.equal(provider.supports(ProviderCapabilityEnum.STREAMS), true);
  assert.equal(provider.supports(ProviderCapabilityEnum.SUBTITLES), false);
});
