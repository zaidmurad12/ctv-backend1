import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
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
}

export class MovieSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiPropertyOptional()
  runtime?: number | null;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: ArtworkDto })
  artwork!: ArtworkDto;
}

export class MovieDetailDto extends MovieSummaryDto {
  @ApiPropertyOptional()
  originalTitle?: string | null;

  @ApiPropertyOptional()
  tagline?: string | null;

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
}

export class ShowSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional()
  releaseDate?: string | null;

  @ApiPropertyOptional()
  rating?: number | null;

  @ApiProperty()
  numberOfSeasons!: number;

  @ApiProperty()
  numberOfEpisodes!: number;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: ArtworkDto })
  artwork!: ArtworkDto;
}

export class ShowDetailDto extends ShowSummaryDto {
  @ApiPropertyOptional()
  originalTitle?: string | null;

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

  @ApiPropertyOptional()
  overview?: string | null;

  @ApiPropertyOptional()
  runtime?: number | null;

  @ApiPropertyOptional()
  stillImage?: string | null;
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
