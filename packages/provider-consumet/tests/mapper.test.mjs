import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeContentId,
  encodeContentId,
  mapEpisodeFromShow,
  mapMovieInfo,
  mapSearchResult,
  mapSeasonFromShow,
  mapShowInfo,
  mapStreamSources,
  mapSubtitles,
} from '../dist/index.js';

test('encodeContentId/decodeContentId round-trip', () => {
  const encoded = encodeContentId('media-1', 'watch-1');
  assert.equal(encoded, 'media-1::watch-1');
  assert.deepEqual(decodeContentId(encoded), { mediaId: 'media-1', playableId: 'watch-1' });
});

test('decodeContentId tolerates a bare id with no separator', () => {
  assert.deepEqual(decodeContentId('media-1'), { mediaId: 'media-1', playableId: 'media-1' });
});

test('mapSearchResult classifies movie vs show by the raw "type" field', () => {
  const result = mapSearchResult({
    totalResults: 2,
    results: [
      { id: 'm1', title: 'A Movie', type: 'Movie', image: 'poster.jpg' },
      { id: 's1', title: 'A TV Series', type: 'TV Series' },
    ],
  });

  assert.equal(result.totalCount, 2);
  assert.equal(result.items[0].kind, 'movie');
  assert.equal(result.items[0].artwork.poster, 'poster.jpg');
  assert.equal(result.items[1].kind, 'show');
});

test('mapMovieInfo folds the media id and playable episode id into one external id, with no streams/subtitles eagerly attached', () => {
  const dto = mapMovieInfo({
    id: 'movie-1',
    title: 'Example Movie',
    description: 'An example.',
    image: 'poster.jpg',
    cover: 'backdrop.jpg',
    episodes: [{ id: 'watch-1' }],
  });

  assert.equal(dto.providerMovieId, 'movie-1::watch-1');
  assert.equal(dto.title, 'Example Movie');
  assert.equal(dto.isAvailable, true);
  assert.deepEqual(dto.streams, []);
  assert.deepEqual(dto.subtitles, []);
});

test('mapMovieInfo falls back to the media id when no episodes list is present', () => {
  const dto = mapMovieInfo({ id: 'movie-2', title: 'No Episodes' });
  assert.equal(dto.providerMovieId, 'movie-2::movie-2');
});

test('mapShowInfo groups episodes into seasons and mapSeasonFromShow/mapEpisodeFromShow find them', () => {
  const show = mapShowInfo({
    id: 'show-1',
    title: 'Example Show',
    episodes: [
      { id: 'e1', season: 1, number: 1, title: 'Pilot' },
      { id: 'e2', season: 1, number: 2, title: 'Second' },
      { id: 'e3', season: 2, number: 1, title: 'S2E1' },
    ],
  });

  assert.equal(show.seasons.length, 2);
  assert.equal(show.seasons[0].seasonNumber, 1);
  assert.equal(show.seasons[0].episodes.length, 2);

  const season2 = mapSeasonFromShow(show, 2);
  assert.equal(season2.episodes.length, 1);

  const episode = mapEpisodeFromShow(show, 1, 2);
  assert.equal(episode.title, 'Second');
  assert.equal(episode.providerEpisodeId, 'show-1::e2');

  assert.equal(mapEpisodeFromShow(show, 99, 1), null);
});

test('mapStreamSources maps quality/m3u8 flags into the unified stream DTO shape', () => {
  const streams = mapStreamSources({
    sources: [
      { url: 'https://cdn/1080.m3u8', quality: '1080p', isM3U8: true },
      { url: 'https://cdn/auto', isM3U8: false },
    ],
  });

  assert.equal(streams.length, 2);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].codec, 'hls');
  assert.equal(streams[1].quality, 'auto');
  assert.equal(streams[1].codec, undefined);
});

test('mapSubtitles maps language/format and drops thumbnail tracks', () => {
  const subtitles = mapSubtitles({
    sources: [],
    subtitles: [
      { url: 'https://cdn/en.vtt', lang: 'English' },
      { url: 'https://cdn/thumbnails.vtt', lang: 'thumbnails' },
    ],
  });

  assert.equal(subtitles.length, 1);
  assert.equal(subtitles[0].language, 'English');
  assert.equal(subtitles[0].format, 'vtt');
  assert.equal(subtitles[0].providerName, 'consumet');
});
