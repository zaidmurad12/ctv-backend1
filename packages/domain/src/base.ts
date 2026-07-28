import { DomainEvent } from './events.js';
import { ValidationError } from './errors.js';

export abstract class EntityBase<TId extends string = string> {
  protected constructor(readonly id: TId) {}
}

export abstract class AggregateRoot<TId extends string = string> extends EntityBase<TId> {
  private readonly _domainEvents: DomainEvent[] = [];

  protected constructor(id: TId) {
    super(id);
  }

  get domainEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }
}

export abstract class ValueObjectBase {
  protected assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new ValidationError(message);
    }
  }
}
