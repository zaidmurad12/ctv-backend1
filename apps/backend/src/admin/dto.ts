import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { SourceLinkDto, type SourceLink } from '../common/sourceLinks.js';

// Query-string booleans arrive as the literal strings "true"/"false" - class-transformer's own
// `@Type(() => Boolean)` would coerce *any* non-empty string (including "false") to `true`,
// so this reads the raw string explicitly instead.
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

export class AdminListUsersQueryDto extends PaginationQueryDto {}

export class UpdateUserRoleDto {
  @ApiPropertyOptional({ enum: ['ADMIN', 'EDITOR', 'VIEWER'] })
  @IsOptional()
  @IsIn(['ADMIN', 'EDITOR', 'VIEWER'])
  role?: 'ADMIN' | 'EDITOR' | 'VIEWER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DashboardStatisticsDto {
  @ApiProperty()
  movies!: number;

  @ApiProperty()
  shows!: number;

  @ApiProperty()
  episodes!: number;

  @ApiProperty()
  users!: number;
}

export class ProviderSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  priority!: number;

  @ApiProperty({ type: [String] })
  capabilities!: string[];

  @ApiProperty()
  isEnabled!: boolean;

  @ApiPropertyOptional()
  lastSyncAt?: string | null;

  @ApiPropertyOptional({
    description: 'Rolling success rate in [0, 1] since process start; null until first use.',
  })
  successRate?: number | null;
}

export class ProviderHealthSummaryDto {
  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  latencyMs!: number;

  @ApiProperty()
  lastCheckedAt!: string;
}

export class UpdateProviderPriorityDto {
  @ApiProperty({ description: 'Lower number = higher priority.' })
  @IsInt()
  @Min(1)
  priority!: number;
}

export class AdminListMoviesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Original language ISO code, e.g. "en"/"ar"' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'rating', 'rating-asc', 'popularity'] })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'rating', 'rating-asc', 'popularity'])
  sort?: string;

  @ApiPropertyOptional({
    description: "Filter to movies that do/don't have at least one active stream yet",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasStream?: boolean;

  @ApiPropertyOptional({
    description: "Filter to movies that do/don't have at least one subtitle yet",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasSubtitle?: boolean;

  // Distinct from hasStream - a movie with no stored Stream row can still have a real,
  // confirmed CEE/Cinemana match (see ScheduledImportService's own sourceMatchCheck), which is
  // what the app's own live fallback plays from on the spot. `true`/`false` only ever match a
  // movie ScheduledImportService has actually checked - a movie it hasn't reached yet (both
  // hasSourceMatch and sourceMatchCheckedAt still null) matches neither value, so this filter
  // naturally excludes the "not checked yet" bucket rather than lumping it in with "no match".
  @ApiPropertyOptional({
    description:
      'Filter to movies with a confirmed (true) or confirmed-absent (false) CEE/Cinemana source match - only ever set for movies with no stored stream; unset means not checked yet',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasSourceMatch?: boolean;

  @ApiPropertyOptional({
    description: 'Filter to exactly one status (e.g. show published-only or draft-only)',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'PUBLISHED', 'REMOVED', 'INACTIVE'])
  status?: string;

  // See AdminMoviesRepository.list's own comment on why titleAr matters for source matching, not
  // just display.
  @ApiPropertyOptional({ description: 'Filter to movies with no Arabic title on file' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingArabicTitle?: boolean;

  @ApiPropertyOptional({ description: 'Filter to movies missing a logo and/or a backdrop image' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingArtwork?: boolean;
}

export class ImportWorkDto {
  @ApiProperty({ description: 'TMDB numeric id' })
  @IsString()
  @MinLength(1)
  tmdbId!: string;
}

// "Smart import": search TMDB's own /discover endpoint by criteria (rating, year, genre,
// original language) instead of importing one known TMDB id at a time.
export class DiscoverQueryDto {
  @ApiProperty({ enum: ['movie', 'show'] })
  @IsIn(['movie', 'show'])
  type!: 'movie' | 'show';

  @ApiPropertyOptional({
    enum: [
      'vote_average.desc',
      'popularity.desc',
      'primary_release_date.desc',
      'first_air_date.desc',
    ],
  })
  @IsOptional()
  @IsIn([
    'vote_average.desc',
    'popularity.desc',
    'primary_release_date.desc',
    'first_air_date.desc',
  ])
  sortBy?:
    'vote_average.desc' | 'popularity.desc' | 'primary_release_date.desc' | 'first_air_date.desc';

  @ApiPropertyOptional({ description: 'Release year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'TMDB genre name, e.g. "Action"' })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Original language ISO code, e.g. "ar"' })
  @IsOptional()
  @IsString()
  originalLanguage?: string;

  @ApiPropertyOptional({
    description:
      'Minimum TMDB vote count, to keep "best rated" from surfacing obscure/barely-rated titles',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minVoteCount?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description:
      "TMDB's own result page (20 per page there) - advance this to see titles beyond the first batch",
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class DiscoverCandidateDto {
  @ApiProperty()
  tmdbId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  overview!: string;

  @ApiPropertyOptional()
  poster!: string | null;

  @ApiPropertyOptional()
  releaseDate!: string | null;

  @ApiProperty()
  rating!: number;

  @ApiProperty()
  voteCount!: number;

  @ApiProperty({
    description: 'Already in the catalog - shown so an admin can skip re-importing it',
  })
  alreadyImported!: boolean;
}

export class DiscoverImportDto {
  @ApiProperty({ enum: ['movie', 'show'] })
  @IsIn(['movie', 'show'])
  type!: 'movie' | 'show';

  @ApiProperty({ type: [String], description: 'TMDB numeric ids to import' })
  @IsArray()
  @IsString({ each: true })
  tmdbIds!: string[];
}

export class DiscoverImportResultDto {
  @ApiProperty()
  tmdbId!: string;

  @ApiProperty()
  success!: boolean;

  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class SubtitleCandidateDto {
  @ApiProperty()
  fileId!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  releaseName!: string;

  @ApiProperty()
  downloadCount!: number;

  @ApiProperty()
  rating!: number;
}

export class FeaturedItemInputDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['movie', 'show'] })
  @IsIn(['movie', 'show'])
  type!: 'movie' | 'show';
}

export class SetFeaturedDto {
  @ApiProperty({
    type: [FeaturedItemInputDto],
    description:
      'Complete, ordered list of movies/shows for the home hero carousel - array position is the new order.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeaturedItemInputDto)
  items!: FeaturedItemInputDto[];
}

export class ImportSubtitleFromSearchDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fileId!: string;

  @ApiProperty({ example: 'ar' })
  @IsString()
  @MinLength(1)
  language!: string;
}

export class DiscoverImportArchiveDto {
  @ApiProperty({ type: [String], description: 'Internet Archive item identifiers to import' })
  @IsArray()
  @IsString({ each: true })
  identifiers!: string[];
}

export class ArchiveDiscoverCandidateDto {
  @ApiProperty()
  identifier!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  year!: number | null;

  @ApiPropertyOptional()
  thumbnailUrl!: string | null;

  @ApiProperty({
    description: 'Only titles with a recognized public-domain/CC license can actually be imported',
  })
  isRecognizedOpenLicense!: boolean;

  @ApiProperty({ description: 'Has at least one playable .mp4 derivative' })
  hasPlayableFile!: boolean;

  @ApiPropertyOptional({ description: 'Matched TMDB id, used for real metadata at import time' })
  matchedTmdbId!: string | null;

  @ApiPropertyOptional()
  matchedPoster!: string | null;

  @ApiProperty({
    description: 'Already in the catalog (by the matched TMDB id) - shown so an admin can skip it',
  })
  alreadyImported!: boolean;
}

export class ArchiveImportResultDto {
  @ApiProperty()
  identifier!: string;

  @ApiProperty()
  success!: boolean;

  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  error?: string;
}

// Every field optional - a PATCH only ever sends what actually changed.
export class UpdateMovieDto {
  // Admin-pinned CEE/Cinemana entries (see Movie.sourceLinks) - replaces the whole list when sent.
  @ApiPropertyOptional({ type: [SourceLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceLinkDto)
  sourceLinks?: SourceLinkDto[];

  // Manual compatibility mark (see Movie.hasSourceMatch): true = tested and plays from a source,
  // false = tested and does not, null = clears it back to "not tested yet".
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  hasSourceMatch?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overview?: string;

  // REMOVED, not the schema-nonexistent "ARCHIVED" this used to validate against - saving a
  // movie with that value passed DTO validation fine but then threw at the database itself,
  // since MovieStatusEnum (see schema.prisma) has never actually had an ARCHIVED member.
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'REMOVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'REMOVED'])
  status?: string;

  // Manual overrides only - never a file upload. The app calls these URLs directly and never
  // downloads/rehosts them (same rule streams/subtitles already follow).
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  poster?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  backdrop?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  logo?: string;
}

export class AdminMovieSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  titleAr?: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({
    description: 'ISO 639-1 code, e.g. "en"/"ar" - an "ar" title needs no Arabic subtitle',
  })
  originalLanguage?: string | null;

  @ApiPropertyOptional()
  poster?: string | null;

  @ApiPropertyOptional()
  backdrop?: string | null;

  @ApiPropertyOptional()
  logo?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiProperty({ description: 'Whether at least one active Stream exists yet' })
  hasPlayableStream!: boolean;

  @ApiProperty({ description: 'Whether at least one Subtitle exists yet' })
  hasSubtitles!: boolean;

  @ApiPropertyOptional({
    description:
      'Confirmed CEE/Cinemana source match (see Movie.hasSourceMatch) - null when hasPlayableStream is true (not applicable) or when ScheduledImportService has not checked this movie yet',
  })
  hasSourceMatch?: boolean | null;

  @ApiPropertyOptional({
    description:
      'Position in the home hero carousel, null if not featured - see Movie.featuredOrder',
  })
  featuredOrder?: number | null;
}

export class AdminStreamDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  quality!: string;

  @ApiPropertyOptional()
  serverName?: string | null;

  @ApiProperty()
  streamUrl!: string;

  @ApiPropertyOptional()
  language?: string | null;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  isActive!: boolean;
}

export class AdminSubtitleDto {
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

  @ApiProperty({ description: '"pending" | "done" | "failed" - see audioSyncAnalysisService.ts' })
  syncAnalysisStatus!: string;

  @ApiProperty()
  defaultOffsetMs!: number;

  @ApiProperty()
  defaultSpeed!: number;
}

export class AdminMovieDetailDto extends AdminMovieSummaryDto {
  @ApiPropertyOptional({ type: [SourceLinkDto] })
  sourceLinks?: SourceLink[];

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiProperty({ type: [AdminStreamDto] })
  streams!: AdminStreamDto[];

  @ApiProperty({ type: [AdminSubtitleDto] })
  subtitles!: AdminSubtitleDto[];
}

export class CreateStreamDto {
  @ApiProperty({ example: '1080p' })
  @IsString()
  @MinLength(1)
  quality!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serverName?: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  streamUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateStreamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  streamUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSubtitleDto {
  @ApiProperty({ example: 'ar' })
  @IsString()
  @MinLength(1)
  language!: string;

  @ApiPropertyOptional({ example: 'vtt', description: 'Defaults to vtt' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

// The admin already has the subtitle *file itself* downloaded locally (reported as "I download
// the subtitle file - add an upload feature") rather than a working direct-file URL to paste into
// CreateSubtitleDto - the browser reads it as plain text client-side (a subtitle file is always
// text, never binary) and posts the content straight through as JSON, no multipart/file-upload
// plumbing needed on either side.
export class UploadSubtitleDto {
  @ApiProperty({ example: 'ar' })
  @IsString()
  @MinLength(1)
  language!: string;

  @ApiPropertyOptional({ example: 'srt', description: 'Defaults to srt' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty({
    description: 'The raw subtitle file content (.srt/.vtt), read as text client-side',
  })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSubtitleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  // Lets an admin manually correct/confirm the sync PreviewModal (apps/admin) applies for every
  // future viewer - the manually tuned offset/speed defaults (there is no automatic analysis anymore), just
  // writable here too for whenever the automatic result needs a manual override.
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  defaultOffsetMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  defaultSpeed?: number;
}

// --- TV shows: same admin management surface as movies (list/import/delete/reimport/edit),
// plus per-episode stream/subtitle management (a show itself never has playable streams -
// only its episodes do). ---------------------------------------------------------------------

export class AdminListShowsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter to shows manually marked compatible / incompatible (unmarked ones match neither)',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasSourceMatch?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Original language ISO code, e.g. "en"/"ar"' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'rating', 'rating-asc', 'popularity'] })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'rating', 'rating-asc', 'popularity'])
  sort?: string;

  // "Missing" rather than movies' own hasStream/hasSubtitle ("has at least one") - a show is
  // never really "done" until *every* episode has a stream/subtitle, so what an admin actually
  // wants to find is the show with at least one gap, not the show with zero coverage at all.
  @ApiPropertyOptional({
    description: "Filter to shows that do/don't have at least one episode missing an active stream",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingStream?: boolean;

  @ApiPropertyOptional({
    description: "Filter to shows that do/don't have at least one episode missing a subtitle",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingSubtitle?: boolean;

  // The positive counterpart missingStream doesn't cover: "has at least one playable episode
  // anywhere" vs "genuinely has zero streams across every episode" - separate from missingStream
  // (which is true for nearly every show, since almost none are 100% complete) because an admin
  // asking "which shows have no playback source at all" wants this, not that.
  @ApiPropertyOptional({
    description: 'Filter to shows that do/do not have at least one active stream on any episode',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasAnyStream?: boolean;

  @ApiPropertyOptional({
    description: 'Filter to exactly one status (e.g. show published-only or draft-only)',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'PUBLISHED', 'REMOVED', 'INACTIVE'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter to shows with no Arabic title on file' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingArabicTitle?: boolean;

  @ApiPropertyOptional({ description: 'Filter to shows missing a logo and/or a backdrop image' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  missingArtwork?: boolean;
}

// Every field optional - a PATCH only ever sends what actually changed.
export class UpdateShowDto {
  // Admin-pinned CEE/Cinemana entries (see Movie.sourceLinks) - replaces the whole list when sent.
  @ApiPropertyOptional({ type: [SourceLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceLinkDto)
  sourceLinks?: SourceLinkDto[];

  // Manual compatibility mark (see Movie.hasSourceMatch): true = tested and plays from a source,
  // false = tested and does not, null = clears it back to "not tested yet".
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  hasSourceMatch?: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overview?: string;

  // See UpdateMovieDto's own comment - REMOVED, not the schema-nonexistent "ARCHIVED".
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED', 'REMOVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'REMOVED'])
  status?: string;

  // Manual overrides only - never a file upload, same rule movies follow.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  poster?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  backdrop?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  logo?: string;
}

export class AdminShowSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  hasSourceMatch?: boolean | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  titleAr?: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({
    description: 'ISO 639-1 code, e.g. "en"/"ar" - an "ar" title needs no Arabic subtitle',
  })
  originalLanguage?: string | null;

  @ApiPropertyOptional()
  poster?: string | null;

  @ApiPropertyOptional()
  backdrop?: string | null;

  @ApiPropertyOptional()
  logo?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiProperty()
  numberOfSeasons!: number;

  @ApiProperty()
  numberOfEpisodes!: number;

  @ApiPropertyOptional({
    description:
      'Position in the home hero carousel, null if not featured - see TVShow.featuredOrder',
  })
  featuredOrder?: number | null;

  @ApiProperty({
    description:
      'True if any imported episode is missing an active stream or a subtitle - the show as a whole still needs admin attention',
  })
  hasIncompleteEpisodes!: boolean;

  @ApiProperty({
    description: 'True if at least one episode has an active stream from any provider',
  })
  hasAnyPlayableStream!: boolean;
}

export class AdminEpisodeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  seasonNumber!: number;

  @ApiProperty()
  episodeNumber!: number;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  stillImage?: string | null;

  @ApiProperty()
  hasPlayableStream!: boolean;

  @ApiProperty()
  hasSubtitles!: boolean;

  @ApiPropertyOptional({
    description:
      'ISO date - only imported at all once aired or airing within the next 7 days, see bootstrap-importer.mjs',
  })
  airDate?: string | null;

  // Loaded eagerly (not behind a separate per-episode fetch) - a show's full episode list is a
  // bounded, known-in-advance size, unlike a paginated movie list, so there's no reason to make
  // expanding one episode's stream/subtitle rows in the admin UI cost a second round trip.
  @ApiProperty({ type: [AdminStreamDto] })
  streams!: AdminStreamDto[];

  @ApiProperty({ type: [AdminSubtitleDto] })
  subtitles!: AdminSubtitleDto[];
}

export class AdminSeasonSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  seasonNumber!: number;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiPropertyOptional({
    description: 'ISO date - only imported at all once started or starting within the next 7 days',
  })
  airDate?: string | null;

  @ApiProperty({ type: [AdminEpisodeSummaryDto] })
  episodes!: AdminEpisodeSummaryDto[];
}

export class AdminShowDetailDto extends AdminShowSummaryDto {
  @ApiPropertyOptional({ type: [SourceLinkDto] })
  sourceLinks?: SourceLink[];

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiProperty({ type: [AdminSeasonSummaryDto] })
  seasons!: AdminSeasonSummaryDto[];
}

// The admin banner-management page's combined movie+show selection - see FeaturedItemDto in
// ../catalog/dto.ts for the equivalent on the public/app-facing side.
export type AdminFeaturedItemDto =
  (AdminMovieSummaryDto & { type: 'movie' }) | (AdminShowSummaryDto & { type: 'show' });

// Re-splits a show's existing episodes (in their current season/episode order) into a new season
// layout - e.g. [9, 6, 8, 8, 10] = five seasons of 9/6/8/8/10 episodes. See
// AdminShowsRepository.restructureSeasons for exactly what it preserves and what it creates.
export class RestructureSeasonsDto {
  @ApiProperty({ type: [Number], description: 'Episode count of each season, in order' })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  layout!: number[];

  @ApiPropertyOptional({
    description: 'Allow deleting trailing episodes when the new layout covers fewer than exist',
  })
  @IsOptional()
  @IsBoolean()
  allowDelete?: boolean;
}
