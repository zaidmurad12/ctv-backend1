import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AddFavoriteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  movieId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  showId?: string;
}

export class FavoriteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  movieId?: string | null;

  @ApiPropertyOptional()
  showId?: string | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  poster?: string | null;

  @ApiProperty()
  createdAt!: string;
}
