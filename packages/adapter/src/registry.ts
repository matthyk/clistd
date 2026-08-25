import type { ClistdAdapter } from './types.js';

export interface AdapterRegistry {
  readonly adapters: readonly ClistdAdapter[];
  get(id: string): ClistdAdapter | undefined;
}

export function createAdapterRegistry(adapters: readonly ClistdAdapter[]): AdapterRegistry {
  const byId = new Map<string, ClistdAdapter>();
  for (const adapter of adapters) {
    if (adapter.metadata.id.trim().length === 0) throw new Error('Adapter IDs must not be empty.');
    if (byId.has(adapter.metadata.id)) {
      throw new Error(`An adapter with ID "${adapter.metadata.id}" is already registered.`);
    }
    byId.set(adapter.metadata.id, adapter);
  }
  return { adapters: [...adapters], get: (id: string) => byId.get(id) };
}
