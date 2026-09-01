import type {
  ProviderArtworkDto,
  ProviderCatalogItemDto,
  ProviderEpisodeDto,
  ProviderMovieDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
} from '@ctv-platform/sdk';
import type {
  CinemanaAllInfoResponse,
  CinemanaSearchResponse,
  CinemanaSeasonResponse,
  CinemanaStreamsResponse,
  CinemanaVideoEntry,
} from '../types/cinemanaApi.js';

function title(entry: CinemanaVideoEntry): string {
  return entry.en_title || entry.ar_title || 'Untitled';
}

function overview(entry: CinemanaVideoEntry): string | undefined {
  return entry.en_content || entry.ar_content || undefined;
}

function artwork(entry: CinemanaVideoEntry): ProviderArtworkDto {
  return {
    poster: entry.imgObjUrl,
    backdrop: entry.imgObjUrl,
    thumbnail: entry.imgThumbObjUrl ?? entry.imgMediumThumbObjUrl,
  };
}

/** "1" = movie, anything else (in practice "2") = series - see cinemanaApi.ts's own note. */
function normalizeKind(kind: string | undefined): 'movie' | 'show' {
  return kind === '1' ? 'movie' : 'show';
}

export function mapSearchResults(
  raw: CinemanaSearchResponse,
): readonly ProviderCatalogItemDto[] {
  return raw.map((entry) => ({
    // A series search result is itself one episode row (see the type's own
    // doc comment) - `rootSeries` (when set and non-"0") is the actual show
    // anchor id `doShow`/`videoSeason` expects, not the episode's own `nb`.
    providerContentId:
      entry.rootSeries && entry.rootSeries !== '0' ? entry.rootSeries : entry.nb,
    kind: normalizeKind(entry.kind),
    title: title(entry),
    artwork: artwork(entry),
  }));
}

export function mapMovieInfo(raw: CinemanaAllInfoResponse): ProviderMovieDto {
  return {
    providerMovieId: raw.nb,
    title: title(raw),
    overview: overview(raw),
    releaseDate: raw.year,
    isAvailable: true,
    artwork: artwork(raw),
    // Streams/subtitles are separate capabilities (STREAMS/SUBTITLES),
    // fetched on demand via streams()/subtitles() - never eagerly here.
    streams: [],
    subtitles: [],
    raw: raw as unknown as Record<string, unknown>,
  };
}

function mapEpisode(entry: CinemanaVideoEntry): ProviderEpisodeDto {
  const episodeNumber = Number(entry.episodeNummer ?? '0');
  return {
    providerEpisodeId: entry.nb,
    seasonNumber: Number(entry.season ?? '1'),
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : 0,
    title: title(entry),
    overview: overview(entry),
    isAvailable: true,
    streams: [],
    subtitles: [],
  };
}

/**
 * `videoSeason/id/{showId}` returns every episode across every season as one
 * flat list (see this package's README) - this groups them the same way
 * `consumetMapper.ts`'s `mapShowInfo` groups its own flat episode list.
 */
export function mapShowInfo(
  showId: string,
  anchor: CinemanaVideoEntry,
  episodes: CinemanaSeasonResponse,
): ProviderShowDto {
  const bySeasonNumber = new Map<number, CinemanaVideoEntry[]>();
  for (const episode of episodes) {
    const seasonNumber = Number(episode.season ?? '1');
    const bucket = bySeasonNumber.get(seasonNumber) ?? [];
    bucket.push(episode);
    bySeasonNumber.set(seasonNumber, bucket);
  }

  const seasons: ProviderSeasonDto[] = [...bySeasonNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, seasonEpisodes]) => ({
      providerSeasonId: `${showId}::${seasonNumber}`,
      seasonNumber,
      episodes: seasonEpisodes.map(mapEpisode),
    }));

  return {
    providerShowId: showId,
    title: title(anchor),
    overview: overview(anchor),
    isAvailable: true,
    artwork: artwork(anchor),
    seasons,
  };
}

export function mapSeasonFromShow(
  show: ProviderShowDto,
  seasonNumber: number,
): ProviderSeasonDto | null {
  return show.seasons.find((season) => season.seasonNumber === seasonNumber) ?? null;
}

export function mapEpisodeFromShow(
  show: ProviderShowDto,
  seasonNumber: number,
  episodeNumber: number,
): ProviderEpisodeDto | null {
  const season = mapSeasonFromShow(show, seasonNumber);
  return season?.episodes.find((episode) => episode.episodeNumber === episodeNumber) ?? null;
}

export function mapStreams(raw: CinemanaStreamsResponse): readonly ProviderStreamDto[] {
  return raw.map((variant) => ({
    providerStreamId: variant.transcoddedFileName,
    quality: variant.resolution,
    serverName: 'Cinemana',
    playbackUrl: variant.videoUrl,
    codec: variant.container,
  }));
}

export function mapSubtitles(raw: CinemanaAllInfoResponse): readonly ProviderSubtitleDto[] {
  return (raw.translations ?? []).map((track) => ({
    language: track.type || track.name,
    format: track.extention,
    downloadUrl: track.file,
    isDefault: track.type === 'ar',
    providerName: 'cinemana',
  }));
}
