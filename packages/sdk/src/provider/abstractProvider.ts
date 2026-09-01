import { randomUUID } from 'node:crypto';
import { err } from '@ctv-platform/domain';
import type { AuthenticationStrategy } from '../auth/authenticationStrategy.js';
import { NoopAuthenticationStrategy } from '../auth/authenticationStrategy.js';
import type { ProviderConfig } from '../config.js';
import type {
  ProviderEpisodeDto,
  ProviderMovieDto,
  ProviderSearchResultDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
} from '../dto.js';
import { ProviderCapabilityEnum, ProviderErrorCodeEnum } from '../enums.js';
import { ProviderError } from '../errors.js';
import type { ProviderHealth } from '../health.js';
import type { ProviderLogger } from '../logger.js';
import type { ProviderMetadata } from '../metadata.js';
import type { DiscoverQuery, SearchQuery } from '../queries.js';
import type { RateLimiter } from '../rateLimit/rateLimiter.js';
import { FixedWindowRateLimiter } from '../rateLimit/rateLimiter.js';
import { executeWithRetry } from '../retry/executeWithRetry.js';
import type { RetryPolicy } from '../retry/retryPolicy.js';
import { ExponentialBackoffRetryPolicy } from '../retry/retryPolicy.js';
import type { ProviderResult } from '../result.js';
import type { ProviderInterface } from './providerInterface.js';

export interface AbstractProviderDependencies {
  readonly rateLimiter?: RateLimiter;
  readonly retryPolicy?: RetryPolicy;
  readonly authenticationStrategy?: AuthenticationStrategy;
}

/**
 * Template-method base class shared by every concrete provider. Handles
 * capability gating, rate limiting, retries (with authentication refresh on
 * 401), and structured logging uniformly, so a concrete provider only has to
 * implement the `doXxx` primitives that actually talk to the external API.
 */
export abstract class AbstractProvider implements ProviderInterface {
  private readonly rateLimiter: RateLimiter;
  private readonly retryPolicy: RetryPolicy;
  private readonly authenticationStrategy: AuthenticationStrategy;

  constructor(
    readonly metadata: ProviderMetadata,
    protected readonly config: ProviderConfig,
    protected readonly logger: ProviderLogger,
    dependencies: AbstractProviderDependencies = {},
  ) {
    this.rateLimiter =
      dependencies.rateLimiter ??
      new FixedWindowRateLimiter(config.maxRequestsPerInterval, config.intervalMs);
    this.retryPolicy = dependencies.retryPolicy ?? new ExponentialBackoffRetryPolicy(config.retry);
    this.authenticationStrategy =
      dependencies.authenticationStrategy ?? new NoopAuthenticationStrategy();
  }

  supports(capability: ProviderCapabilityEnum): boolean {
    return this.metadata.capabilities.includes(capability);
  }

  health(): Promise<ProviderResult<ProviderHealth>> {
    return this.executeGuarded({ endpoint: 'health' }, () => this.doHealth());
  }

  discover(query: DiscoverQuery): Promise<ProviderResult<ProviderSearchResultDto>> {
    return this.executeGuarded(
      { endpoint: 'discover', capability: ProviderCapabilityEnum.DISCOVERY },
      () => this.doDiscover(query),
    );
  }

  search(query: SearchQuery): Promise<ProviderResult<ProviderSearchResultDto>> {
    return this.executeGuarded(
      { endpoint: 'search', capability: ProviderCapabilityEnum.SEARCH },
      () => this.doSearch(query),
    );
  }

  movie(providerMovieId: string): Promise<ProviderResult<ProviderMovieDto>> {
    return this.executeGuarded(
      { endpoint: 'movie', capability: ProviderCapabilityEnum.MOVIE_DETAILS },
      () => this.doMovie(providerMovieId),
    );
  }

  show(providerShowId: string): Promise<ProviderResult<ProviderShowDto>> {
    return this.executeGuarded(
      { endpoint: 'show', capability: ProviderCapabilityEnum.SHOW_DETAILS },
      () => this.doShow(providerShowId),
    );
  }

  season(providerShowId: string, seasonNumber: number): Promise<ProviderResult<ProviderSeasonDto>> {
    return this.executeGuarded(
      { endpoint: 'season', capability: ProviderCapabilityEnum.SEASON_DETAILS },
      () => this.doSeason(providerShowId, seasonNumber),
    );
  }

  episode(
    providerShowId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ProviderResult<ProviderEpisodeDto>> {
    return this.executeGuarded(
      { endpoint: 'episode', capability: ProviderCapabilityEnum.EPISODE_DETAILS },
      () => this.doEpisode(providerShowId, seasonNumber, episodeNumber),
    );
  }

  streams(providerContentId: string): Promise<ProviderResult<readonly ProviderStreamDto[]>> {
    return this.executeGuarded(
      { endpoint: 'streams', capability: ProviderCapabilityEnum.STREAMS },
      () => this.doStreams(providerContentId),
    );
  }

  subtitles(providerContentId: string): Promise<ProviderResult<readonly ProviderSubtitleDto[]>> {
    return this.executeGuarded(
      { endpoint: 'subtitles', capability: ProviderCapabilityEnum.SUBTITLES },
      () => this.doSubtitles(providerContentId),
    );
  }

  protected abstract doHealth(): Promise<ProviderResult<ProviderHealth>>;
  protected abstract doDiscover(
    query: DiscoverQuery,
  ): Promise<ProviderResult<ProviderSearchResultDto>>;
  protected abstract doSearch(query: SearchQuery): Promise<ProviderResult<ProviderSearchResultDto>>;
  protected abstract doMovie(providerMovieId: string): Promise<ProviderResult<ProviderMovieDto>>;
  protected abstract doShow(providerShowId: string): Promise<ProviderResult<ProviderShowDto>>;
  protected abstract doSeason(
    providerShowId: string,
    seasonNumber: number,
  ): Promise<ProviderResult<ProviderSeasonDto>>;
  protected abstract doEpisode(
    providerShowId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ProviderResult<ProviderEpisodeDto>>;
  protected abstract doStreams(
    providerContentId: string,
  ): Promise<ProviderResult<readonly ProviderStreamDto[]>>;
  protected abstract doSubtitles(
    providerContentId: string,
  ): Promise<ProviderResult<readonly ProviderSubtitleDto[]>>;

  /** Override for providers with their own login flow; the default is a no-op. */
  protected async refreshAuthentication(): Promise<void> {
    await this.authenticationStrategy.authenticate();
  }

  private async executeGuarded<T>(
    context: { readonly endpoint: string; readonly capability?: ProviderCapabilityEnum },
    operation: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    if (context.capability !== undefined && !this.supports(context.capability)) {
      return err(
        new ProviderError(
          ProviderErrorCodeEnum.NOT_SUPPORTED,
          this.metadata.id,
          `Provider "${this.metadata.id}" does not support "${context.capability}".`,
        ),
      );
    }

    const correlationId = randomUUID();
    const startedAt = Date.now();
    await this.rateLimiter.acquire();

    const result = await executeWithRetry(operation, this.retryPolicy, {
      onRetry: (decision, attempt, error) => {
        if (error.code === ProviderErrorCodeEnum.RATE_LIMITED) {
          this.rateLimiter.reportRateLimited(error.retryAfterMs ?? undefined);
        }
        this.logger.warn(`Provider request ${decision.shouldRetry ? 'retrying' : 'failed'}`, {
          provider: this.metadata.id,
          endpoint: context.endpoint,
          correlationId,
          attempt,
          code: error.code,
        });
      },
      onRefreshAuthentication: () => this.refreshAuthentication(),
    });

    this.logger.info('Provider request completed', {
      provider: this.metadata.id,
      endpoint: context.endpoint,
      correlationId,
      durationMs: Date.now() - startedAt,
      ok: result.ok,
    });

    return result;
  }
}
