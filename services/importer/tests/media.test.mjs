import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArtworkImporter,
  processArtwork,
  StreamImporter,
  SubtitleImporter,
} from '../dist/index.js';

test('StreamImporter marks the first stream as default and delegates to the port', async () => {
  const calls = [];
  const port = {
    reconcileForMovieLink: async (linkId, streams) => {
      calls.push([linkId, streams]);
      return { created: streams.length, updated: 0, deactivated: 0 };
    },
    reconcileForEpisodeLink: async () => ({ created: 0, updated: 0, deactivated: 0 }),
  };
  const importer = new StreamImporter(port);

  const summary = await importer.importForMovie('link-1', [
    {
      providerStreamId: 's1',
      quality: '1080p',
      serverName: 'A',
      playbackUrl: 'https://example.com/s1',
    },
    {
      providerStreamId: 's2',
      quality: '720p',
      serverName: 'B',
      playbackUrl: 'https://example.com/s2',
    },
  ]);

  assert.equal(summary.created, 2);
  const [, streams] = calls[0];
  assert.equal(streams[0].isDefault, true);
  assert.equal(streams[1].isDefault, false);
});

test('SubtitleImporter upper-cases the format and delegates to the port', async () => {
  const calls = [];
  const port = {
    reconcileForMovieLink: async (linkId, subtitles) => {
      calls.push(subtitles);
      return { created: subtitles.length, updated: 0, deactivated: 0 };
    },
    reconcileForEpisodeLink: async () => ({ created: 0, updated: 0, deactivated: 0 }),
  };
  const importer = new SubtitleImporter(port);

  await importer.importForMovie('link-1', [
    {
      language: 'en',
      format: 'srt',
      downloadUrl: 'https://example.com/en.srt',
      isDefault: true,
      providerName: 'p',
    },
  ]);

  assert.equal(calls[0][0].format, 'SRT');
});

test('processArtwork validates each present URL and skips missing ones', () => {
  const result = processArtwork(
    { poster: 'https://example.com/poster.jpg', backdrop: '/relative.jpg' },
    'cinemana',
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, 'poster');
  assert.equal(result.items[0].provider, 'cinemana');
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /artwork\.backdrop/);
});

test('ArtworkImporter delegates to the port for movies and shows', async () => {
  const calls = [];
  const port = {
    reconcileForMovie: async (movieId, items) => {
      calls.push(['movie', movieId, items]);
      return { created: items.length, updated: 0, deactivated: 0 };
    },
    reconcileForShow: async (showId, items) => {
      calls.push(['show', showId, items]);
      return { created: items.length, updated: 0, deactivated: 0 };
    },
  };
  const importer = new ArtworkImporter(port);

  await importer.importForMovie('movie-1', [
    { kind: 'poster', url: 'https://example.com/p.jpg', provider: 'x' },
  ]);
  await importer.importForShow('show-1', []);

  assert.equal(calls[0][0], 'movie');
  assert.equal(calls[1][0], 'show');
});
