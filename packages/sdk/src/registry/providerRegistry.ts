import type { ProviderCapabilityEnum } from '../enums.js';
import { ProviderAlreadyRegisteredError, ProviderNotRegisteredError } from '../errors.js';
import type { ProviderInterface } from '../provider/providerInterface.js';
import type { ProviderFactory } from './providerFactory.js';

/**
 * The single place providers are registered and looked up, so nothing else
 * in the platform hardcodes a provider name or calls `new SomeProvider()`
 * directly. Supports both eager instances (handy in tests) and lazy
 * factories (the production path).
 */
export class ProviderRegistry {
  private readonly instances = new Map<string, ProviderInterface>();
  private readonly factories = new Map<string, ProviderFactory>();

  register(provider: ProviderInterface): void {
    this.assertNotRegistered(provider.metadata.id);
    this.instances.set(provider.metadata.id, provider);
  }

  registerFactory(factory: ProviderFactory): void {
    this.assertNotRegistered(factory.providerId);
    this.factories.set(factory.providerId, factory);
  }

  unregister(providerId: string): void {
    this.instances.delete(providerId);
    this.factories.delete(providerId);
  }

  resolve(providerId: string): ProviderInterface {
    const existing = this.instances.get(providerId);
    if (existing) {
      return existing;
    }

    const factory = this.factories.get(providerId);
    if (!factory) {
      throw new ProviderNotRegisteredError(providerId);
    }

    const created = factory.create();
    this.instances.set(providerId, created);
    return created;
  }

  tryResolve(providerId: string): ProviderInterface | null {
    if (!this.isRegistered(providerId)) {
      return null;
    }
    return this.resolve(providerId);
  }

  isRegistered(providerId: string): boolean {
    return this.instances.has(providerId) || this.factories.has(providerId);
  }

  /** All registered provider ids, without forcing lazy factories to instantiate. */
  listIds(): readonly string[] {
    return [...new Set([...this.instances.keys(), ...this.factories.keys()])];
  }

  /** All registered providers, sorted by ascending priority (lower = higher priority). */
  list(): readonly ProviderInterface[] {
    return this.listIds()
      .map((id) => this.resolve(id))
      .sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  listByCapability(capability: ProviderCapabilityEnum): readonly ProviderInterface[] {
    return this.list().filter((provider) => provider.supports(capability));
  }

  private assertNotRegistered(providerId: string): void {
    if (this.isRegistered(providerId)) {
      throw new ProviderAlreadyRegisteredError(providerId);
    }
  }
}
