import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpsertContinueWatchingDto {
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
}

export class ContinueWatchingResponseDto {
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
  updatedAt!: string;
}
