import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

export class SearchQueryDto extends PaginationQueryDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  declare search: string;
}

export class SearchResultItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['movie', 'show'] })
  type!: 'movie' | 'show';

  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  titleAr?: string | null;

  @ApiProperty({ required: false, nullable: true })
  poster?: string | null;

  // Free to include - the query behind this already fetches the full row (see
  // searchQueryRepository.ts), so these cost nothing extra to return. Lets a result card show a
  // rating/year the same way every other card in the app does, instead of search results being
  // the one place in the app missing them.
  @ApiProperty({ required: false, nullable: true })
  rating?: number | null;

  @ApiProperty({ required: false, nullable: true })
  releaseDate?: string | null;

  // Shows never have this (only Movie carries collectionId - see schema.prisma) - see
  // MovieQueryRepository/partNumbers.ts for the full reasoning on why this is derived at
  // response time rather than stored.
  @ApiProperty({ required: false, nullable: true })
  partNumber?: number | null;

  // Same meaning as on the catalog summaries: the admin compatibility check found it on the
  // sources (or, for a movie, it has an active stream) - so "show available titles only" keeps it.
  @ApiProperty({ required: false, nullable: true })
  hasSourceMatch?: boolean | null;
}

export class SuggestQueryDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  search!: string;
}
