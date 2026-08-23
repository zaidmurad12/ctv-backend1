import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserResponseDto } from '../auth/dto.js';
import { Roles } from '../common/decorators/decorators.js';
import type { Page } from '../catalog/useCases.js';
import { AdminListUsersQueryDto, UpdateProviderPriorityDto, UpdateUserRoleDto } from './dto.js';
import type {
  DashboardStatisticsDto,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
} from './dto.js';
import { AdminUsersUseCases, DashboardUseCases, ProvidersUseCases } from './useCases.js';

/** specification/12-Security.md.txt RBAC: every route here is Administrator only. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly usersUseCases: AdminUsersUseCases,
    private readonly dashboardUseCases: DashboardUseCases,
    private readonly providersUseCases: ProvidersUseCases,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  listUsers(@Query() query: AdminListUsersQueryDto): Promise<Page<UserResponseDto>> {
    return this.usersUseCases.list(query);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update a user’s role or active status' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserRoleDto): Promise<UserResponseDto> {
    return this.usersUseCases.updateUser(id, dto);
  }

  @Get('dashboard/statistics')
  @ApiOperation({ summary: 'Catalog and user counts' })
  statistics(): Promise<DashboardStatisticsDto> {
    return this.dashboardUseCases.getStatistics();
  }

  @Get('providers')
  @ApiOperation({ summary: 'List registered providers' })
  providers(): Promise<ProviderSummaryDto[]> {
    return this.providersUseCases.list();
  }

  @Get('providers/health')
  @ApiOperation({ summary: 'Health-check every registered provider' })
  providersHealth(): Promise<ProviderHealthSummaryDto[]> {
    return this.providersUseCases.health();
  }

  @Post('providers/:id/discover')
  @ApiOperation({ summary: 'Trigger a manual discovery run for a registered provider' })
  discover(@Param('id') id: string): Promise<{ discovered: number }> {
    return this.providersUseCases.triggerDiscovery(id);
  }

  @Post('providers/:id/enable')
  @HttpCode(204)
  @ApiOperation({ summary: 'Enable a registered provider at runtime, no restart required' })
  enable(@Param('id') id: string): Promise<void> {
    return this.providersUseCases.setEnabled(id, true);
  }

  @Post('providers/:id/disable')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disable a registered provider at runtime, no restart required' })
  disable(@Param('id') id: string): Promise<void> {
    return this.providersUseCases.setEnabled(id, false);
  }

  @Patch('providers/:id/priority')
  @ApiOperation({ summary: "Change a provider's priority (lower number = higher priority)" })
  updatePriority(@Param('id') id: string, @Body() dto: UpdateProviderPriorityDto): Promise<void> {
    return this.providersUseCases.setPriority(id, dto.priority);
  }

  @Post('providers/:id/reload')
  @ApiOperation({ summary: "Re-run a single provider's health check on demand" })
  reload(@Param('id') id: string): Promise<ProviderHealthSummaryDto> {
    return this.providersUseCases.reload(id);
  }
}
