import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { isOk } from '@ctv-platform/domain';
import { DiscoveryModeEnum } from '@ctv-platform/importer';
import { NotFoundError } from '@ctv-platform/domain';
import { buildPaginationMeta } from '../common/dto/pagination.dto.js';
import { USER_REPOSITORY, type UserRepository } from '../auth/ports.js';
import { UserResponseDto } from '../auth/dto.js';
import type { Page } from '../catalog/useCases.js';
import { ProviderRegistryRepository } from '../providers/infrastructure/providerRegistryRepository.js';
import { ProviderMetricsTracker } from '../providers/providerMetricsTracker.js';
import { ProvidersRuntime } from '../providers/providersRuntime.js';
import type {
  AdminListUsersQueryDto,
  DashboardStatisticsDto,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
  UpdateUserRoleDto,
} from './dto.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';

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
export class ProvidersUseCases implements OnModuleInit {
  constructor(
    private readonly runtime: ProvidersRuntime,
    private readonly registryRepository: ProviderRegistryRepository,
    private readonly metrics: ProviderMetricsTracker,
  ) {}

  /** Seeds a `Provider` row for every registered provider so admin actions have something to update. */
  async onModuleInit(): Promise<void> {
    for (const provider of this.runtime.registry.list()) {
      await this.registryRepository.syncDefaults(
        provider.metadata.id,
        provider.metadata.name,
        null,
        provider.metadata.priority,
      );
    }
  }

  async list(): Promise<ProviderSummaryDto[]> {
    return Promise.all(
      this.runtime.registry.list().map(async (provider) => {
        const row = await this.registryRepository.findBySlug(provider.metadata.id);
        return {
          id: provider.metadata.id,
          name: provider.metadata.name,
          priority: row?.priority ?? provider.metadata.priority,
          capabilities: [...provider.metadata.capabilities],
          isEnabled: row?.isEnabled ?? true,
          lastSyncAt: row?.lastSyncAt ? row.lastSyncAt.toISOString() : null,
          successRate: this.metrics.successRate(provider.metadata.id),
        };
      }),
    );
  }

  async health(): Promise<ProviderHealthSummaryDto[]> {
    const snapshots = await this.runtime.lifecycleManager.initialize();
    await Promise.all(
      snapshots.map((snapshot) =>
        this.registryRepository.touchLastSync(snapshot.providerId).catch(() => undefined),
      ),
    );
    return snapshots.map((snapshot) => ({
      providerId: snapshot.providerId,
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      lastCheckedAt: snapshot.lastCheckedAt.toISOString(),
    }));
  }

  async triggerDiscovery(providerId: string): Promise<{ discovered: number }> {
    const provider = this.assertRegistered(providerId);
    const result = await this.runtime.discoveryEngine.run(provider, DiscoveryModeEnum.MANUAL);
    if (!isOk(result)) {
      throw new NotFoundException(result.error.message);
    }
    return { discovered: result.value.items.length };
  }

  async setEnabled(providerId: string, isEnabled: boolean): Promise<void> {
    this.assertRegistered(providerId);
    await this.registryRepository.setEnabled(providerId, isEnabled);
  }

  async setPriority(providerId: string, priority: number): Promise<void> {
    this.assertRegistered(providerId);
    await this.registryRepository.setPriority(providerId, priority);
  }

  /** Re-runs a single provider's health check on demand ("Reload"/"Health Check" in the admin panel). */
  async reload(providerId: string): Promise<ProviderHealthSummaryDto> {
    this.assertRegistered(providerId);
    const snapshot = await this.runtime.lifecycleManager.refresh(providerId);
    await this.registryRepository.touchLastSync(providerId);
    return {
      providerId: snapshot.providerId,
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      lastCheckedAt: snapshot.lastCheckedAt.toISOString(),
    };
  }

  private assertRegistered(providerId: string) {
    const provider = this.runtime.registry.tryResolve(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" is not registered.`);
    }
    return provider;
  }
}
