export class IntegrationRegistryKindLock {
    private readonly tails = new Map<string, Promise<void>>();

    async run<T>(kind: string, operation: () => Promise<T>): Promise<T> {
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
