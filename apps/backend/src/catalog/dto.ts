import type { SourceLink } from '../common/sourceLinks.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'popularity', 'rating', 'releaseDate', 'alphabetical', 'runtime'],
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'popularity', 'rating', 'releaseDate', 'alphabetical', 'runtime'])
  declare sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({
    description:
      'Only titles available on the playback sources (compatibility check passed, or an active stream)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  available?: boolean;
}

export class ArtworkDto {
  @ApiPropertyOptional()
  poster?: string;

  @ApiPropertyOptional()
  backdrop?: string;

  @ApiPropertyOptional()
  logo?: string;

  @ApiPropertyOptional()
  thumbnail?: string;

  @ApiPropertyOptional()
  still?: string;
}

export class StreamResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  quality!: string;

  @ApiPropertyOptional()
  codec?: string | null;

  @ApiPropertyOptional()
  language?: string | null;

  @ApiProperty()
  serverName!: string;

  @ApiProperty()
  streamUrl!: string;

  @ApiProperty()
  isDefault!: boolean;
}

export class SubtitleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  format!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  isDefault!: boolean;

  // The manual offset/speed correction (set from the admin panel's own subtitle editor, or by the
  // viewer's own in-player stepper, whichever was set last) - the only sync mechanism this app
  // has; the automatic multi-point audio-analysis system this replaced (syncAnchors,
  // audioSyncAnalysisService.ts, the sync-issues admin tab) was removed entirely as dead weight -
  // nothing left ever populated or consumed it.
  @ApiProperty()
  defaultOffsetMs!: number;

  @ApiProperty()
  defaultSpeed!: number;
}

export class MovieSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  // Was only ever exposed on MovieDetailDto - every list/summary view (home rails, browse,
  // search results) had no Arabic title at all to show even when the app's own language was
  // Arabic, so the client always fell back to the English title there regardless.
  @ApiPropertyOptional()
  titleAr?: string | null;

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional({
    description: 'TMDB-native or Gemini-translated Arabic overview, if any - see Movie.overviewAr',
  })
  overviewAr?: string | null;

  // Was only ever exposed nowhere at all - the app's own source-matching (calculateMatchScore in
  // api.ts) has a fast, near-certain exact-match path keyed on this, but could only ever reach it
  // for a title opened from Search (the one place that already carried it, via SearchResultItemDto).
  // Every other entry point (Home, Browse, a show's own detail, Person's filmography, this row's
  // own View More screen) fell straight through to fuzzy title+year matching instead, which is
  // exactly the kind of case (a remake, an alternate regional title, a title that just doesn't
  // collapse to a good enough similarity score) that was failing to match a title actually present
  // on a source, or picking the wrong one.
  @ApiPropertyOptional({
    description: 'IMDb id (e.g. "tt0903747"), if TMDB had one at import time',
  })
  imdbId?: string | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  runtime?: number | null;

  @ApiPropertyOptional()
  ageRating?: string | null;

  @ApiPropertyOptional({ description: 'ISO 639-1 code, e.g. "en"/"ar"' })
  originalLanguage?: string | null;

  @ApiPropertyOptional({
    description:
      'Source-compatibility check result (admin panel): true = plays from a source, false = not found, null = not checked',
  })
  hasSourceMatch?: boolean | null;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [String] })
  genres!: string[];

  @ApiProperty({
    description:
      'Whether at least one active Stream exists yet - drives the Play vs "Coming Soon" affordance without needing a per-title detail fetch',
  })
  hasPlayableStream!: boolean;

  @ApiPropertyOptional({
    description:
      'Set when this movie belongs to a TMDB collection/franchise, shared across every part',
  })
  collectionId?: string | null;

  // Computed at response time from this movie's position (by releaseDate) among every other
  // PUBLISHED movie sharing the same collectionId - see MovieQueryRepository.attachPartNumbers.
  // Not a stored column: nothing on the actual Movie row tracks a franchise's viewing order, so
  // this is derived fresh on every response rather than needing its own migration/backfill. Null
  // for anything with no collectionId at all.
  @ApiPropertyOptional()
  partNumber?: number | null;

  @ApiProperty({ type: ArtworkDto })
  artwork!: ArtworkDto;
}

export class CastMemberDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  character?: string | null;

  @ApiPropertyOptional()
  photo?: string | null;

  @ApiPropertyOptional({ description: 'ISO date - see bootstrap-importer.mjs ensurePerson()' })
  birthday?: string | null;

  @ApiPropertyOptional({ description: 'ISO date, present only if the person has died' })
  deathday?: string | null;

  @ApiPropertyOptional()
  biography?: string | null;

  @ApiPropertyOptional({ description: 'Gemini-translated from `biography` at import time' })
  biographyAr?: string | null;

  @ApiPropertyOptional({
    description: 'TMDB free-text birthplace, e.g. "Los Angeles, California, USA"',
  })
  placeOfBirth?: string | null;
}

export class MovieDetailDto extends MovieSummaryDto {
  // Admin-pinned CEE/Cinemana entries this title plays from - see Movie.sourceLinks.
  @ApiPropertyOptional()
  sourceLinks?: SourceLink[];

  @ApiPropertyOptional()
  originalTitle?: string | null;

  @ApiPropertyOptional()
  tagline?: string | null;

  @ApiProperty({ type: [CastMemberDto] })
  cast!: CastMemberDto[];

  @ApiPropertyOptional({ type: CastMemberDto })
  director?: CastMemberDto | null;

  @ApiPropertyOptional({ type: CastMemberDto })
  writer?: CastMemberDto | null;

  @ApiPropertyOptional({ description: 'Production country name(s), comma-joined' })
  country?: string | null;

  @ApiProperty({ type: [StreamResponseDto] })
  streams!: StreamResponseDto[];

  @ApiProperty({ type: [SubtitleResponseDto] })
  subtitles!: SubtitleResponseDto[];

  // Imported automatically from TMDB (see extractEnrichmentFields.ts) and stored on Movie.trailer
  // (movieMapper.ts maps it to/from the domain entity's own trailerUrl) - this DTO simply never
  // had a field for it, so the mapper below had nothing to actually assign it into and every
  // client (the RN app's own Movie.trailerUrl included) always received `undefined` regardless
  // of whether the import actually found one. Reported as "no movie's trailer ever shows" - the
  // real cause was never the player, it was that no trailer link ever reached it.
  @ApiPropertyOptional({ description: 'YouTube watch URL, if TMDB had one at import time' })
  trailerUrl?: string | null;
}

export class SeasonSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  seasonNumber!: number;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty()
  episodeCount!: number;

  @ApiPropertyOptional()
  poster?: string | null;

  @ApiPropertyOptional({
    description:
      'ISO date - only imported once started or starting within 7 days, see Season.airDate',
  })
  airDate?: string | null;
}

export class ShowSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  titleAr?: string | null;

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional({
    description: 'TMDB-native or Gemini-translated Arabic overview, if any - see TVShow.overviewAr',
  })
  overviewAr?: string | null;

  // See MovieSummaryDto's identical field for why this matters everywhere, not just detail/search.
  @ApiPropertyOptional({
    description: 'IMDb id (e.g. "tt0903747"), if TMDB had one at import time',
  })
  imdbId?: string | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiProperty()
  numberOfSeasons!: number;

  @ApiProperty()
  numberOfEpisodes!: number;

  @ApiPropertyOptional()
  ageRating?: string | null;

  @ApiPropertyOptional({ description: 'ISO 639-1 code, e.g. "en"/"ar"' })
  originalLanguage?: string | null;

  @ApiPropertyOptional({
    description:
      'Source-compatibility check result (admin panel): true = plays from a source, false = not found, null = not checked',
  })
  hasSourceMatch?: boolean | null;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [String] })
  genres!: string[];

  @ApiProperty({ type: ArtworkDto })
  artwork!: ArtworkDto;
}

// The home hero carousel (see /movies/featured) can mix movies and shows in one admin-ordered
// sequence - `type` is how the client tells which shape it's looking at (a show summary has no
// `runtime`, a movie has no `numberOfSeasons`, etc.) and picks the right mapper.
export type FeaturedItemDto =
  (MovieSummaryDto & { type: 'movie' }) | (ShowSummaryDto & { type: 'show' });

export class ShowDetailDto extends ShowSummaryDto {
  @ApiPropertyOptional()
  sourceLinks?: SourceLink[];

  @ApiPropertyOptional()
  originalTitle?: string | null;

  @ApiProperty({ type: [CastMemberDto] })
  cast!: CastMemberDto[];

  @ApiPropertyOptional({ type: CastMemberDto })
  director?: CastMemberDto | null;

  @ApiPropertyOptional({ type: CastMemberDto })
  writer?: CastMemberDto | null;

  // TMDB has no show-level director/writer credit for almost any real series (see
  // creditsMapper.ts's own mapCreator comment) - director/writer above are kept for shape
  // consistency with MovieDetailDto but are effectively always null for a show; this is the
  // actual populated show-level credit; the app shows it in their place for series.
  @ApiPropertyOptional({ type: CastMemberDto })
  creator?: CastMemberDto | null;

  @ApiPropertyOptional({ description: 'Production country name(s), comma-joined' })
  country?: string | null;

  @ApiProperty({ type: [SeasonSummaryDto] })
  seasons!: SeasonSummaryDto[];
}

export class EpisodeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  episodeNumber!: number;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({
    description: 'TMDB-native Arabic episode title, if TMDB has one for it - see Episode.titleAr',
  })
  titleAr?: string | null;

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional({
    description:
      'TMDB-native Arabic episode overview, if TMDB has one for it - see Episode.overviewAr',
  })
  overviewAr?: string | null;

  @ApiPropertyOptional()
  runtime?: number | null;

  @ApiPropertyOptional()
  stillImage?: string | null;

  @ApiPropertyOptional({
    description:
      'ISO date - only imported once aired or airing within 7 days, see Episode.airDate. In the future = not aired yet.',
  })
  airDate?: string | null;

  @ApiProperty({ description: 'Whether at least one active Stream exists yet' })
  hasPlayableStream!: boolean;
}

export class SeasonDetailDto extends SeasonSummaryDto {
  @ApiPropertyOptional()
  overview?: string | null;

  @ApiProperty({ type: [EpisodeSummaryDto] })
  episodes!: EpisodeSummaryDto[];
}

export class EpisodeDetailDto extends EpisodeSummaryDto {
  @ApiProperty({ type: [StreamResponseDto] })
  streams!: StreamResponseDto[];

  @ApiProperty({ type: [SubtitleResponseDto] })
  subtitles!: SubtitleResponseDto[];
}

export class PersonCreditDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['movie', 'show'] })
  type!: 'movie' | 'show';

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  titleAr?: string | null;

  @ApiPropertyOptional()
  hasSourceMatch?: boolean | null;

  @ApiPropertyOptional()
  poster?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;
}

export class PersonDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  photo?: string | null;

  @ApiPropertyOptional()
  birthday?: string | null;

  @ApiPropertyOptional()
  deathday?: string | null;

  @ApiPropertyOptional()
  biography?: string | null;

  @ApiPropertyOptional()
  biographyAr?: string | null;

  @ApiPropertyOptional()
  placeOfBirth?: string | null;

  @ApiProperty({
    type: [PersonCreditDto],
    description:
      'Every published movie/show this person is credited on, as cast or crew, newest first',
  })
  filmography!: PersonCreditDto[];
}
