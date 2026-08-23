import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
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
