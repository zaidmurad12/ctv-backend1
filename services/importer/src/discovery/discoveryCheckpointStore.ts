export interface DiscoveryCheckpointStore {
  getLastDiscoveredAt(providerId: string): Promise<Date | null>;
  setLastDiscoveredAt(providerId: string, timestamp: Date): Promise<void>;
}

/**
 * Process-lifetime checkpoint store. A durable adapter (backed by the
 * `Setting` table, for example) is reasonable future work but is out of
 * scope here: it would require a new repository, and this milestone does
 * not touch `packages/infrastructure`. Documented, not hidden.
 */
export class InMemoryDiscoveryCheckpointStore implements DiscoveryCheckpointStore {
  private readonly checkpoints = new Map<string, Date>();

  async getLastDiscoveredAt(providerId: string): Promise<Date | null> {
    return this.checkpoints.get(providerId) ?? null;
  }

  async setLastDiscoveredAt(providerId: string, timestamp: Date): Promise<void> {
    this.checkpoints.set(providerId, timestamp);
  }
}
