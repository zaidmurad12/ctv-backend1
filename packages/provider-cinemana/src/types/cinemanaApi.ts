/**
 * Raw shapes returned by `cinemana.shabakaty.com/api/android/...` - the
 * undocumented backend the official "Shabakaty Cinemana" Android app itself
 * calls (see this package's README). Confirmed by hand against live
 * responses for `AdvancedSearch`, `allVideoInfo/id/{id}`,
 * `transcoddedFiles/id/{id}`, and `videoSeason/id/{id}`; kept loose (most
 * fields optional) since none of this is officially documented and fields
 * could change without notice.
 */

export interface CinemanaCategory {
  readonly en_title?: string;
  readonly ar_title?: string;
}

/** One row from `AdvancedSearch` or `videoSeason/id/{id}` - both share this shape. */
export interface CinemanaVideoEntry {
  readonly nb: string;
  readonly en_title?: string;
  readonly ar_title?: string;
  readonly en_content?: string;
  readonly ar_content?: string;
  readonly year?: string;
  /** "1" = movie, "2" = series (an episode row when this came from a series search/season list). */
  readonly kind?: string;
  readonly season?: string;
  readonly episodeNummer?: string;
  /** Present (and non-"0") on episode rows; points back at the show's own anchor `nb`. */
  readonly rootSeries?: string;
  readonly imgObjUrl?: string;
  readonly imgThumbObjUrl?: string;
  readonly imgMediumThumbObjUrl?: string;
  readonly trailer?: string;
  readonly imdbUrlRef?: string;
  readonly stars?: string;
  readonly duration?: string;
  readonly categories?: readonly CinemanaCategory[];
}

export type CinemanaSearchResponse = readonly CinemanaVideoEntry[];
export type CinemanaSeasonResponse = readonly CinemanaVideoEntry[];

export interface CinemanaTranslation {
  readonly id: number;
  /** e.g. "arabic" / "english" - a display name, not a language code. */
  readonly name: string;
  /** The actual language code ("ar" / "en" / ...). */
  readonly type: string;
  /** File extension without the dot ("srt" / "vtt"). */
  readonly extention: string;
  /** Presigned, time-limited download URL - never cache this beyond `cacheTtlSeconds`. */
  readonly file: string;
}

export interface CinemanaAllInfoResponse extends CinemanaVideoEntry {
  readonly translations?: readonly CinemanaTranslation[];
}

export interface CinemanaStreamVariant {
  readonly name: string;
  /** e.g. "720p" */
  readonly resolution: string;
  readonly container: string;
  readonly transcoddedFileName: string;
  /** Presigned, time-limited download URL - never cache this beyond `cacheTtlSeconds`. */
  readonly videoUrl: string;
}

export type CinemanaStreamsResponse = readonly CinemanaStreamVariant[];
