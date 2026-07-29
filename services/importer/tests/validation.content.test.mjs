import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEpisodeForPublish,
  validateMedia,
  validateMovieForPublish,
  validateShowForPublish,
} from '../dist/index.js';

test('validateMovieForPublish requires a provider link and at least one stream', () => {
  assert.equal(validateMovieForPublish({ hasProviderLink: true, validStreamCount: 1 }).valid, true);
  assert.equal(
    validateMovieForPublish({ hasProviderLink: false, validStreamCount: 1 }).valid,
    false,
  );
  assert.equal(
    validateMovieForPublish({ hasProviderLink: true, validStreamCount: 0 }).valid,
    false,
  );
});

test('validateShowForPublish requires a provider link, seasons, and episodes', () => {
  assert.equal(
    validateShowForPublish({ hasProviderLink: true, seasonCount: 1, episodeCount: 1 }).valid,
    true,
  );
  assert.equal(
    validateShowForPublish({ hasProviderLink: true, seasonCount: 0, episodeCount: 1 }).valid,
    false,
  );
  assert.equal(
    validateShowForPublish({ hasProviderLink: true, seasonCount: 1, episodeCount: 0 }).valid,
    false,
  );
});

test('validateEpisodeForPublish requires a valid season/episode number and at least one stream', () => {
  assert.equal(
    validateEpisodeForPublish({ seasonNumber: 1, episodeNumber: 1, validStreamCount: 1 }).valid,
    true,
  );
  assert.equal(
    validateEpisodeForPublish({ seasonNumber: 0, episodeNumber: 1, validStreamCount: 1 }).valid,
    false,
  );
  assert.equal(
    validateEpisodeForPublish({ seasonNumber: 1, episodeNumber: 1, validStreamCount: 0 }).valid,
    false,
  );
});

test('validateMedia filters out invalid streams/subtitles while keeping valid ones', () => {
  const result = validateMedia(
    [
      {
        providerStreamId: 's1',
        quality: '1080p',
        serverName: 'A',
        playbackUrl: 'https://example.com/s1',
      },
      {
        providerStreamId: 's2',
        quality: '',
        serverName: 'B',
        playbackUrl: 'https://example.com/s2',
      },
    ],
    [
      {
        language: 'en',
        format: 'SRT',
        downloadUrl: 'https://example.com/en.srt',
        isDefault: true,
        providerName: 'p',
      },
      {
        language: 'ar',
        format: 'unknown',
        downloadUrl: 'https://example.com/ar.srt',
        isDefault: false,
        providerName: 'p',
      },
    ],
  );

  assert.equal(result.validStreams.length, 1);
  assert.equal(result.validSubtitles.length, 1);
  assert.equal(result.issues.length, 2);
});
