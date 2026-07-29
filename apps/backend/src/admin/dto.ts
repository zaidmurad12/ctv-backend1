import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

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
