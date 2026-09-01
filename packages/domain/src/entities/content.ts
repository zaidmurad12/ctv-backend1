import { AggregateRoot } from '../base.js';
import type { DomainEvent } from '../events.js';
import { ContentPublishedEvent, ContentRemovedEvent } from '../events.js';
import { ValidationError } from '../errors.js';
import { Duration, Rating, Title, UrlValue } from '../value-objects.js';
import type { MediaCategory, MediaStatus, TimestampedEntity } from '../types.js';

/**
 * Shared base class for catalog content in the domain.
 */
export abstract class ContentEntity extends AggregateRoot<string> implements TimestampedEntity {
  protected constructor(
    id: string,
    readonly kind: MediaCategory,
    protected _title: Title,
    protected _overview: string | null,
    protected _status: MediaStatus,
    protected _createdAt: Date,
    protected _updatedAt: Date,
    protected _events: DomainEvent[] = [],
  ) {
    super(id);
  }

  get title(): Title {
    return this._title;
  }

  get overview(): string | null {
    return this._overview;
  }

  get status(): MediaStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get events(): DomainEvent[] {
    return [...this._events];
  }

  protected record(event: DomainEvent): void {
    this._events.push(event);
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }

  publish(): void {
    if (this._status === 'published') {
      return;
    }
    this._status = 'published';
    this.touch();
    this.record(new ContentPublishedEvent(this.id, this.kind));
  }

  remove(): void {
    if (this._status === 'removed') {
      return;
    }
    this._status = 'removed';
    this.touch();
    this.record(new ContentRemovedEvent(this.id, this.kind));
  }
}

/**
 * Movie is a canonical catalog entity for movies.
 */
export class Movie extends ContentEntity {
  private constructor(
    id: string,
    title: Title,
    overview: string | null,
    status: MediaStatus,
    createdAt: Date,
    updatedAt: Date,
    private _runtime: Duration | null,
    private _rating: Rating | null,
    private _trailerUrl: UrlValue | null,
    events: DomainEvent[] = [],
  ) {
    super(id, 'movie', title, overview, status, createdAt, updatedAt, events);
  }

  static create(props: {
    id: string;
    title: string;
    overview?: string | null;
    runtimeMinutes?: number | null;
    rating?: number | null;
    trailerUrl?: string | null;
  }): Movie {
    const title = Title.create(props.title);
    const runtime =
      props.runtimeMinutes === null || props.runtimeMinutes === undefined
        ? null
        : Duration.create(props.runtimeMinutes);
    const rating =
      props.rating === null || props.rating === undefined ? null : Rating.create(props.rating);
    const trailerUrl =
      props.trailerUrl === null || props.trailerUrl === undefined
        ? null
        : UrlValue.create(props.trailerUrl);

    const now = new Date();
    return new Movie(
      props.id,
      title,
      props.overview ?? null,
      'draft',
      now,
      now,
      runtime,
      rating,
      trailerUrl,
    );
  }

  get runtime(): Duration | null {
    return this._runtime;
  }

  get rating(): Rating | null {
    return this._rating;
  }

  get trailerUrl(): UrlValue | null {
    return this._trailerUrl;
  }

  /**
   * Rehydrates a Movie from persisted state without re-running creation invariants
   * (status/timestamps are preserved as stored). Intended for repository mapping only.
   */
  static reconstitute(props: {
    id: string;
    title: string;
    overview: string | null;
    status: MediaStatus;
    createdAt: Date;
    updatedAt: Date;
    runtimeMinutes: number | null;
    rating: number | null;
    trailerUrl: string | null;
  }): Movie {
    const title = Title.create(props.title);
    const runtime = props.runtimeMinutes === null ? null : Duration.create(props.runtimeMinutes);
    const rating = props.rating === null ? null : Rating.create(props.rating);
    const trailerUrl = props.trailerUrl === null ? null : UrlValue.create(props.trailerUrl);

    return new Movie(
      props.id,
      title,
      props.overview,
      props.status,
      props.createdAt,
      props.updatedAt,
      runtime,
      rating,
      trailerUrl,
    );
  }

  updateMetadata(input: {
    title?: string;
    overview?: string | null;
    runtimeMinutes?: number | null;
    rating?: number | null;
    trailerUrl?: string | null;
  }): void {
    if (input.title !== undefined) {
      this._title = Title.create(input.title);
    }
    if (input.overview !== undefined) {
      this._overview = input.overview;
    }
    if (input.runtimeMinutes !== undefined) {
      this._runtime = input.runtimeMinutes === null ? null : Duration.create(input.runtimeMinutes);
    }
    if (input.rating !== undefined) {
      this._rating = input.rating === null ? null : Rating.create(input.rating);
    }
    if (input.trailerUrl !== undefined) {
      this._trailerUrl = input.trailerUrl === null ? null : UrlValue.create(input.trailerUrl);
    }
    this.touch();
  }
}

/**
 * TVShow is a canonical catalog entity for television series.
 */
export class TVShow extends ContentEntity {
  private constructor(
    id: string,
    title: Title,
    overview: string | null,
    status: MediaStatus,
    createdAt: Date,
    updatedAt: Date,
    private _seasonCount: number,
    private _episodeCount: number,
    events: DomainEvent[] = [],
  ) {
    super(id, 'show', title, overview, status, createdAt, updatedAt, events);
  }

  static create(props: { id: string; title: string; overview?: string | null }): TVShow {
    const title = Title.create(props.title);
    const now = new Date();
    return new TVShow(props.id, title, props.overview ?? null, 'draft', now, now, 0, 0);
  }

  get seasonCount(): number {
    return this._seasonCount;
  }

  get episodeCount(): number {
    return this._episodeCount;
  }

  /**
   * Rehydrates a TVShow from persisted state without re-running creation invariants.
   * Intended for repository mapping only.
   */
  static reconstitute(props: {
    id: string;
    title: string;
    overview: string | null;
    status: MediaStatus;
    createdAt: Date;
    updatedAt: Date;
    seasonCount: number;
    episodeCount: number;
  }): TVShow {
    const title = Title.create(props.title);
    return new TVShow(
      props.id,
      title,
      props.overview,
      props.status,
      props.createdAt,
      props.updatedAt,
      props.seasonCount,
      props.episodeCount,
    );
  }

  updateCounts(seasonCount: number, episodeCount: number): void {
    if (!Number.isInteger(seasonCount) || seasonCount < 0) {
      throw new ValidationError('Season count must be a non-negative integer.');
    }
    if (!Number.isInteger(episodeCount) || episodeCount < 0) {
      throw new ValidationError('Episode count must be a non-negative integer.');
    }
    this._seasonCount = seasonCount;
    this._episodeCount = episodeCount;
    this.touch();
  }
}

/**
 * Season represents a single season inside a TV show.
 */
export class Season extends AggregateRoot<string> {
  private constructor(
    id: string,
    readonly showId: string,
    private _seasonNumber: number,
    private _title: Title | null,
    private _overview: string | null,
    private _episodeCount: number,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {
    super(id);
  }

  static create(props: {
    id: string;
    showId: string;
    seasonNumber: number;
    title?: string | null;
    overview?: string | null;
  }): Season {
    if (!Number.isInteger(props.seasonNumber) || props.seasonNumber < 1) {
      throw new ValidationError('Season number must be a positive integer.');
    }
    const title =
      props.title === undefined || props.title === null ? null : Title.create(props.title);
    const now = new Date();
    return new Season(
      props.id,
      props.showId,
      props.seasonNumber,
      title,
      props.overview ?? null,
      0,
      now,
      now,
    );
  }

  get seasonNumber(): number {
    return this._seasonNumber;
  }

  get title(): Title | null {
    return this._title;
  }

  get overview(): string | null {
    return this._overview;
  }

  get episodeCount(): number {
    return this._episodeCount;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Rehydrates a Season from persisted state without re-running creation invariants.
   * Intended for repository mapping only.
   */
  static reconstitute(props: {
    id: string;
    showId: string;
    seasonNumber: number;
    title: string | null;
    overview: string | null;
    episodeCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): Season {
    const title = props.title === null ? null : Title.create(props.title);
    return new Season(
      props.id,
      props.showId,
      props.seasonNumber,
      title,
      props.overview,
      props.episodeCount,
      props.createdAt,
      props.updatedAt,
    );
  }

  updateMetadata(input: {
    title?: string | null;
    overview?: string | null;
    episodeCount?: number;
  }): void {
    if (input.title !== undefined) {
      this._title = input.title === null ? null : Title.create(input.title);
    }
    if (input.overview !== undefined) {
      this._overview = input.overview;
    }
    if (input.episodeCount !== undefined) {
      if (!Number.isInteger(input.episodeCount) || input.episodeCount < 0) {
        throw new ValidationError('Episode count must be a non-negative integer.');
      }
      this._episodeCount = input.episodeCount;
    }
    this._updatedAt = new Date();
  }
}

/**
 * Episode represents a single episode within a season.
 */
export class Episode extends ContentEntity {
  private constructor(
    id: string,
    title: Title,
    overview: string | null,
    status: MediaStatus,
    createdAt: Date,
    updatedAt: Date,
    private _seasonId: string,
    private _episodeNumber: number,
    private _runtime: Duration | null,
    events: DomainEvent[] = [],
  ) {
    super(id, 'episode', title, overview, status, createdAt, updatedAt, events);
  }

  static create(props: {
    id: string;
    seasonId: string;
    episodeNumber: number;
    title: string;
    overview?: string | null;
    runtimeMinutes?: number | null;
  }): Episode {
    if (!Number.isInteger(props.episodeNumber) || props.episodeNumber < 1) {
      throw new ValidationError('Episode number must be a positive integer.');
    }
    const title = Title.create(props.title);
    const runtime =
      props.runtimeMinutes === null || props.runtimeMinutes === undefined
        ? null
        : Duration.create(props.runtimeMinutes);
    const now = new Date();
    return new Episode(
      props.id,
      title,
      props.overview ?? null,
      'draft',
      now,
      now,
      props.seasonId,
      props.episodeNumber,
      runtime,
    );
  }

  get seasonId(): string {
    return this._seasonId;
  }

  get episodeNumber(): number {
    return this._episodeNumber;
  }

  get runtime(): Duration | null {
    return this._runtime;
  }

  /**
   * Rehydrates an Episode from persisted state without re-running creation invariants.
   * Intended for repository mapping only.
   */
  static reconstitute(props: {
    id: string;
    seasonId: string;
    episodeNumber: number;
    title: string;
    overview: string | null;
    status: MediaStatus;
    createdAt: Date;
    updatedAt: Date;
    runtimeMinutes: number | null;
  }): Episode {
    const title = Title.create(props.title);
    const runtime = props.runtimeMinutes === null ? null : Duration.create(props.runtimeMinutes);
    return new Episode(
      props.id,
      title,
      props.overview,
      props.status,
      props.createdAt,
      props.updatedAt,
      props.seasonId,
      props.episodeNumber,
      runtime,
    );
  }
}
