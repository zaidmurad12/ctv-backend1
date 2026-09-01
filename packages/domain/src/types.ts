export type EntityId = string;

export type MediaStatus = 'draft' | 'pending' | 'published' | 'removed' | 'inactive';

export type MediaCategory = 'movie' | 'show' | 'episode';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface TimestampedEntity {
  readonly id: EntityId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContentReference {
  readonly kind: MediaCategory;
  readonly id: EntityId;
}
