/**
 * Local persistence ports for the Prisma tables that Milestones 1/2 did not
 * model as domain aggregates (Provider, MovieProvider/EpisodeProvider join
 * rows, Stream, Subtitle, Image). Movie/TVShow/Season/Episode already have
 * proper domain repositories from Milestone 1/2 and are reused directly;
 * these ports exist only because streams/subtitles/artwork were out of that
 * scope. They deliberately live here rather than in `packages/domain` or
 * `packages/infrastructure` so that neither completed milestone is touched.
 */

export interface ContentProviderLinkPort {
  /** Ensures a Provider row exists for this provider id, returning its database id. */
  ensureProvider(providerId: string, providerName: string): Promise<string>;

  /** Returns the linked Movie id for this provider's external content id, if any. */
  findMovieIdByExternalId(providerDbId: string, externalId: string): Promise<string | null>;

  /** Creates (or reuses) the MovieProvider join row, returning its id. */
  ensureMovieLink(
    movieId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string>;

  /** Returns the linked Episode id for this provider's external content id, if any. */
  findEpisodeIdByExternalId(providerDbId: string, externalId: string): Promise<string | null>;

  /** Creates (or reuses) the EpisodeProvider join row, returning its id. */
  ensureEpisodeLink(
    episodeId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string>;

  /** Returns the linked TVShow id for this provider's external content id, if any. */
  findShowIdByExternalId(providerDbId: string, externalId: string): Promise<string | null>;

  /** Creates (or reuses) the TVShowProvider join row, returning its id. */
  ensureShowLink(
    showId: string,
    providerDbId: string,
    externalId: string,
    sourceTitle: string,
  ): Promise<string>;
}

export interface StreamInput {
  readonly quality: string;
  readonly serverName: string;
  readonly playbackUrl: string;
  readonly codec?: string;
  readonly language?: string;
  readonly isDefault: boolean;
}

export interface ReconcileSummary {
  readonly created: number;
  readonly updated: number;
  readonly deactivated: number;
}

export interface StreamPort {
  reconcileForMovieLink(
    movieProviderId: string,
    streams: readonly StreamInput[],
  ): Promise<ReconcileSummary>;
  reconcileForEpisodeLink(
    episodeProviderId: string,
    streams: readonly StreamInput[],
  ): Promise<ReconcileSummary>;
}

export interface SubtitleInput {
  readonly language: string;
  readonly format: string;
  readonly downloadUrl: string;
  readonly isDefault: boolean;
}

export interface SubtitlePort {
  reconcileForMovieLink(
    movieProviderId: string,
    subtitles: readonly SubtitleInput[],
  ): Promise<ReconcileSummary>;
  reconcileForEpisodeLink(
    episodeProviderId: string,
    subtitles: readonly SubtitleInput[],
  ): Promise<ReconcileSummary>;
}

export type ArtworkKind = 'poster' | 'backdrop' | 'logo' | 'thumbnail' | 'still';

export interface ArtworkInput {
  readonly kind: ArtworkKind;
  readonly url: string;
  readonly provider: string;
}

export interface ArtworkPort {
  reconcileForMovie(movieId: string, artwork: readonly ArtworkInput[]): Promise<ReconcileSummary>;
  reconcileForShow(showId: string, artwork: readonly ArtworkInput[]): Promise<ReconcileSummary>;
}
