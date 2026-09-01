import type {
  ProviderArtworkDto,
  ProviderCatalogItemDto,
  ProviderEpisodeDto,
  ProviderMovieDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderSearchResultDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
} from '@ctv-platform/sdk';
import type {
  ConsumetEpisodeSummary,
  ConsumetMediaInfoResponse,
  ConsumetSearchResponse,
  ConsumetSubtitleTrack,
  ConsumetWatchResponse,
} from '../types/consumetApi.js';

/**
 * Consumet's `watch` endpoint needs both a media id and an episode/watch id
 * (naming and requiredness vary per underlying source), but
 * `ProviderInterface.streams()`/`.subtitles()` only take one opaque id. We
 * fold both into a single external id here so the rest of the platform never
 * has to know about Consumet's two-id scheme; `decodeContentId` reverses it.
 */
export function encodeContentId(mediaId: string, playableId: string): string {
  return `${mediaId}::${playableId}`;
}

export function decodeContentId(contentId: string): { mediaId: string; playableId: string } {
  const [mediaId, playableId] = contentId.split('::');
  return { mediaId, playableId: playableId ?? mediaId };
}

function normalizeKind(type: string | undefined): 'movie' | 'show' {
  const normalized = (type ?? '').toLowerCase();
  return normalized.includes('tv') || normalized.includes('series') ? 'show' : 'movie';
}

function mapArtwork(image?: string, cover?: string, logo?: string): ProviderArtworkDto {
  return {
    poster: image,
    backdrop: cover ?? image,
    logo,
  };
}

export function mapSearchResult(raw: ConsumetSearchResponse): ProviderSearchResultDto {
  const items: ProviderCatalogItemDto[] = raw.results.map((item) => ({
    providerContentId: item.id,
    kind: normalizeKind(item.type),
    title: item.title,
    artwork: mapArtwork(item.image),
  }));
  return { items, totalCount: raw.totalResults ?? items.length };
}

/** The single playable id for a movie: Consumet media-info lists it as the lone "episode" entry. */
function moviePlayableId(raw: ConsumetMediaInfoResponse): string {
  return raw.episodes?.[0]?.id ?? raw.id;
}

export function mapMovieInfo(raw: ConsumetMediaInfoResponse): ProviderMovieDto {
  return {
    providerMovieId: encodeContentId(raw.id, moviePlayableId(raw)),
    title: raw.title,
    overview: raw.description,
    releaseDate: raw.releaseDate,
    isAvailable: true,
    artwork: mapArtwork(raw.image, raw.cover, raw.logo),
    // Streams/subtitles are a separate capability (STREAMS/SUBTITLES), fetched
    // on demand via streams()/subtitles() — never eagerly here.
    streams: [],
    subtitles: [],
    raw: raw as unknown as Record<string, unknown>,
  };
}

function mapEpisode(mediaId: string, episode: ConsumetEpisodeSummary): ProviderEpisodeDto {
  return {
    providerEpisodeId: encodeContentId(mediaId, episode.id),
    seasonNumber: episode.season ?? 1,
    episodeNumber: episode.number ?? 0,
    title: episode.title ?? `Episode ${episode.number ?? ''}`.trim(),
    overview: episode.description,
    isAvailable: true,
    streams: [],
    subtitles: [],
  };
}

export function mapShowInfo(raw: ConsumetMediaInfoResponse): ProviderShowDto {
  const episodes = raw.episodes ?? [];
  const bySeasonNumber = new Map<number, ConsumetEpisodeSummary[]>();
  for (const episode of episodes) {
    const seasonNumber = episode.season ?? 1;
    const bucket = bySeasonNumber.get(seasonNumber) ?? [];
    bucket.push(episode);
    bySeasonNumber.set(seasonNumber, bucket);
  }

  const seasons: ProviderSeasonDto[] = [...bySeasonNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, seasonEpisodes]) => ({
      providerSeasonId: encodeContentId(raw.id, String(seasonNumber)),
      seasonNumber,
      episodes: seasonEpisodes.map((episode) => mapEpisode(raw.id, episode)),
    }));

  return {
    providerShowId: raw.id,
    title: raw.title,
    overview: raw.description,
    isAvailable: true,
    artwork: mapArtwork(raw.image, raw.cover, raw.logo),
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

function guessSubtitleFormat(url: string): string {
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(url);
  return match ? match[1].toLowerCase() : 'vtt';
}

function subtitleLanguage(track: ConsumetSubtitleTrack): string {
  return track.lang ?? track.language ?? 'unknown';
}

export function mapStreamSources(raw: ConsumetWatchResponse): readonly ProviderStreamDto[] {
  return raw.sources.map((source, index) => ({
    providerStreamId: String(index),
    quality: source.quality ?? 'auto',
    serverName: 'consumet',
    playbackUrl: source.url,
    codec: source.isM3U8 ? 'hls' : source.isDASH ? 'dash' : undefined,
  }));
}

export function mapSubtitles(raw: ConsumetWatchResponse): readonly ProviderSubtitleDto[] {
  return (raw.subtitles ?? [])
    .filter((track) => subtitleLanguage(track).toLowerCase() !== 'thumbnails')
    .map((track) => ({
      language: subtitleLanguage(track),
      format: guessSubtitleFormat(track.url),
      downloadUrl: track.url,
      isDefault: false,
      providerName: 'consumet',
    }));
}
