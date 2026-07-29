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
  poster?: string | null;
}

export class SuggestQueryDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  search!: string;
}
