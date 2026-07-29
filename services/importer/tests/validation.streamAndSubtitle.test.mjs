import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStream, validateSubtitle } from '../dist/index.js';

test('validateStream accepts a well-formed stream', () => {
  const report = validateStream({
    providerStreamId: 's1',
    quality: '1080p',
    serverName: 'A',
    playbackUrl: 'https://example.com/s1.m3u8',
  });
  assert.equal(report.valid, true);
});

test('validateStream rejects an empty quality or server name', () => {
  const report = validateStream({
    providerStreamId: 's1',
    quality: ' ',
    serverName: '',
    playbackUrl: 'https://example.com/s1.m3u8',
  });
  assert.equal(report.valid, false);
  assert.equal(report.issues.length, 2);
});

test('validateStream rejects a relative playback URL', () => {
  const report = validateStream({
    providerStreamId: 's1',
    quality: '720p',
    serverName: 'A',
    playbackUrl: '/relative.m3u8',
  });
  assert.equal(report.valid, false);
});

test('validateSubtitle accepts SRT/VTT/ASS/SSA in any case', () => {
  for (const format of ['srt', 'VTT', 'Ass', 'SSA']) {
    const report = validateSubtitle({
      language: 'en',
      format,
      downloadUrl: 'https://example.com/sub',
      isDefault: false,
      providerName: 'p',
    });
    assert.equal(report.valid, true, format);
  }
});

test('validateSubtitle rejects an unsupported format', () => {
  const report = validateSubtitle({
    language: 'en',
    format: 'txt',
    downloadUrl: 'https://example.com/sub',
    isDefault: false,
    providerName: 'p',
  });
  assert.equal(report.valid, false);
});

test('validateSubtitle rejects an empty language', () => {
  const report = validateSubtitle({
    language: '',
    format: 'SRT',
    downloadUrl: 'https://example.com/sub',
    isDefault: false,
    providerName: 'p',
  });
  assert.equal(report.valid, false);
});
