export type Constructor<T = unknown> = new (...args: never[]) => T;

export interface ServiceRegistration<T = unknown> {
  kind: 'singleton' | 'transient';
  factory: () => T;
}

export class Container {
  private readonly registrations = new Map<string, ServiceRegistration>();
  private readonly singletons = new Map<string, unknown>();

  registerSingleton<T>(key: string, factory: Constructor<T> | (() => T)): void {
    this.registrations.set(key, {
      kind: 'singleton',
      factory: () => (typeof factory === 'function' ? (factory as () => T)() : new (factory as Constructor<T>)()),
    });
  }

  registerTransient<T>(key: string, factory: Constructor<T> | (() => T)): void {
    this.registrations.set(key, {
      kind: 'transient',
      factory: () => (typeof factory === 'function' ? (factory as () => T)() : new (factory as Constructor<T>)()),
    });
  }

  resolve<T>(key: string): T {
    const registration = this.registrations.get(key);
    if (!registration) {
      throw new Error(`Service ${key} is not registered.`);
    }

    if (registration.kind === 'singleton') {
      if (!this.singletons.has(key)) {
        this.singletons.set(key, registration.factory());
      }
      return this.singletons.get(key) as T;
    }

    return registration.factory() as T;
  }
}

export function createContainer(): Container {
  return new Container();
}
