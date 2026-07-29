import type { DomainEvent, EventBus } from '@ctv-platform/domain';
import type { ImportableCategory } from '../types.js';

/**
 * There is no search infrastructure yet (Search is explicitly Milestone 8
 * scope). Rather than faking an index write, this stage publishes a real
 * domain event requesting one; a future search-index subscriber consumes
 * it. This is honest, working code for what this milestone can actually
 * deliver — not a placeholder pretending to update an index that does not
 * exist.
 */
export class ContentIndexUpdateRequestedEvent implements DomainEvent {
  readonly eventType = 'ContentIndexUpdateRequested';
  readonly occurredAt: Date;

  constructor(
    readonly contentId: string,
    readonly category: ImportableCategory,
  ) {
    this.occurredAt = new Date();
  }
}

export class SearchIndexUpdater {
  constructor(private readonly bus: EventBus) {}

  requestUpdate(contentId: string, category: ImportableCategory): void {
    this.bus.publish(new ContentIndexUpdateRequestedEvent(contentId, category));
  }
}
