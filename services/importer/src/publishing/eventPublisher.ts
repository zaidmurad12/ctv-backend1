import type { DomainEvent, DomainEventDispatcher } from '@ctv-platform/domain';

/**
 * Structural shape of `Movie`/`TVShow`/`Episode` (via `ContentEntity`),
 * which track pending domain events on their own `events` getter — distinct
 * from `AggregateRoot`'s separate, unused `domainEvents` mechanism.
 */
export interface HasPendingEvents {
  readonly events: readonly DomainEvent[];
}

/**
 * Drains an entity's pending domain events (e.g. `ContentPublishedEvent`)
 * and dispatches them via the domain's own `EventBus`/
 * `DomainEventDispatcher`, reused directly from Milestone 1.
 */
export class EventPublisher {
  constructor(private readonly dispatcher: DomainEventDispatcher) {}

  publish(entity: HasPendingEvents): void {
    this.dispatcher.dispatchAll([...entity.events]);
  }
}
