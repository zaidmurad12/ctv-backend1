import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RecordHistoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  movieId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  position!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  duration!: number;
}

export class HistoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  movieId?: string | null;

  @ApiPropertyOptional()
  episodeId?: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  duration!: number;

  @ApiProperty()
  lastWatched!: string;
}
