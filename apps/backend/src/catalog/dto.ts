import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
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

  // Computed once, automatically, by the backend's own audio-sync analysis right after this
  // subtitle was attached (see audioSyncAnalysisService.ts) - the app applies these as the
  // starting sync unless the viewer has already saved their own local override for this exact
  // title (see VideoPlayer.tsx).
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

// Sent once the app's own audio-sync feature confidently detects a real mismatch (see
// VideoPlayer.tsx's onAutoSync) - never for every playback, and never for a movie whose original
// language is Arabic (an Arabic-audio title doesn't need an Arabic subtitle to begin with, so a
// mismatch report there isn't a real signal - see SyncIssueRepository's own comment).
export class ReportSyncIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  movieId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  episodeId?: string;

  @ApiProperty()
  @IsInt()
  offsetMs!: number;

  @ApiProperty()
  @IsNumber()
  speed!: number;
}
