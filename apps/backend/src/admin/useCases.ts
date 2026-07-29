import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isOk } from '@ctv-platform/domain';
import { DiscoveryModeEnum } from '@ctv-platform/importer';
import { NotFoundError } from '@ctv-platform/domain';
import { buildPaginationMeta } from '../common/dto/pagination.dto.js';
import { USER_REPOSITORY, type UserRepository } from '../auth/ports.js';
import { UserResponseDto } from '../auth/dto.js';
import type { Page } from '../catalog/useCases.js';
import type {
  AdminListUsersQueryDto,
  DashboardStatisticsDto,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
  UpdateUserRoleDto,
} from './dto.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { ProvidersRuntime } from './infrastructure/providersRuntime.js';

@Injectable()
export class AdminUsersUseCases {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async list(query: AdminListUsersQueryDto): Promise<Page<UserResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.users.list({
      skip: (page - 1) * limit,
      take: limit,
      search: query.search,
    });
    return {
      items: items.map((user) => new UserResponseDto(user)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async updateUser(userId: string, dto: UpdateUserRoleDto): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (dto.role !== undefined) {
      user.changeRole(dto.role);
    }
    if (dto.isActive !== undefined) {
      user.setActive(dto.isActive);
    }
    await this.users.save(user);
    return new UserResponseDto(user);
  }
}

@Injectable()
export class DashboardUseCases {
  constructor(private readonly stats: DashboardStatsRepository) {}

  getStatistics(): Promise<DashboardStatisticsDto> {
    return this.stats.getStatistics();
  }
}

@Injectable()
export class ProvidersUseCases {
  constructor(private readonly runtime: ProvidersRuntime) {}

  list(): ProviderSummaryDto[] {
    return this.runtime.registry.list().map((provider) => ({
      id: provider.metadata.id,
      name: provider.metadata.name,
      priority: provider.metadata.priority,
      capabilities: [...provider.metadata.capabilities],
    }));
  }

  async health(): Promise<ProviderHealthSummaryDto[]> {
    const snapshots = await this.runtime.lifecycleManager.initialize();
    return snapshots.map((snapshot) => ({
      providerId: snapshot.providerId,
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      lastCheckedAt: snapshot.lastCheckedAt.toISOString(),
    }));
  }

  async triggerDiscovery(providerId: string): Promise<{ discovered: number }> {
    const provider = this.runtime.registry.tryResolve(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" is not registered.`);
    }
    const result = await this.runtime.discoveryEngine.run(provider, DiscoveryModeEnum.MANUAL);
    if (!isOk(result)) {
      throw new NotFoundException(result.error.message);
    }
    return { discovered: result.value.items.length };
  }
}
