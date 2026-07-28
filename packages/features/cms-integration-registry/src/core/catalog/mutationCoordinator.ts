import type { IntegrationRegistryMutationCoordinator } from "../../interfaces/mutations";

/** Coordinates mutations only inside one process. Shared-volume multi-writer runtimes need a distributed implementation. */
export class InMemoryIntegrationRegistryMutationCoordinator implements IntegrationRegistryMutationCoordinator {
    private readonly tails = new Map<string, Promise<void>>();

    async runExclusive<T>(kind: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.tails.get(kind) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.tails.set(kind, current);
        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.tails.get(kind) === current) {
                this.tails.delete(kind);
            }
        }
    }
}
