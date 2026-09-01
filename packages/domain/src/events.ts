export interface DomainEvent {
  readonly occurredAt: Date;
  readonly eventType: string;
}

export class EventBus {
  private readonly handlers = new Set<(event: DomainEvent) => void>();

  subscribe(handler: (event: DomainEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

export class DomainEventDispatcher {
  constructor(private readonly bus: EventBus) {}

  dispatch(event: DomainEvent): void {
    this.bus.publish(event);
  }

  dispatchAll(events: DomainEvent[]): void {
    for (const event of events) {
      this.dispatch(event);
    }
  }
}

export class ContentPublishedEvent implements DomainEvent {
  readonly eventType = 'ContentPublished';
  readonly occurredAt: Date;

  constructor(readonly contentId: string, readonly category: 'movie' | 'show' | 'episode') {
    this.occurredAt = new Date();
  }
}

export class ContentRemovedEvent implements DomainEvent {
  readonly eventType = 'ContentRemoved';
  readonly occurredAt: Date;

  constructor(readonly contentId: string, readonly category: 'movie' | 'show' | 'episode') {
    this.occurredAt = new Date();
  }
}
