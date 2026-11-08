import { join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem";
import type {
    RepositoryNamespaceOwnershipStore,
    RepositoryOwnedNamespace,
} from "@bernouy/repository/repository/namespaces";

/** Test metadata adapter; real Mongo persistence and races are exercised separately. */
export class FixtureNamespaceStore implements RepositoryNamespaceOwnershipStore {
    private readonly records = new Map<string, RepositoryOwnedNamespace>();
    constructor(private readonly root: string) {}
    async get(namespace: string) {
        return structuredClone(this.records.get(namespace) ?? null);
    }
    async listOwned(accountId: string) {
        return [...this.records.values()]
            .filter((entry) => entry.ownerAccountId === accountId)
            .sort((a, b) => a.namespace.localeCompare(b.namespace))
            .map((entry) => structuredClone(entry));
    }
    async countOwned(accountId: string, maximum: number) {
        return Math.min(maximum, (await this.listOwned(accountId)).length);
    }
    exclusiveOwners<T>(operation: () => Promise<T>) {
        return withRepositoryWriteLock(join(this.root, "owners"), operation);
    }
    exclusive<T>(
        namespace: string,
        operation: (
            current: RepositoryOwnedNamespace | null,
            save: (next: RepositoryOwnedNamespace) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T> {
        return withRepositoryWriteLock(join(this.root, namespace), async () => {
            let current = await this.get(namespace);
            return operation(current, async (next) => {
                if (next.namespace !== namespace || next.revision !== (current?.revision ?? 0) + 1) {
                    throw new Error("Invalid fixture ownership transition");
                }
                this.records.set(namespace, structuredClone(next));
                current = structuredClone(next);
            });
        });
    }
}
