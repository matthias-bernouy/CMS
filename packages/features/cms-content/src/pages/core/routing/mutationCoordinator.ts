/** Serializes canonical Page and contribution mutations that share one site's route namespace. */
export class PageRouteMutationCoordinator {
    readonly #pending = new Map<string, Promise<void>>();

    async run<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.#pending.get(siteId) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>((resolve) => {
            release = resolve;
        });
        const queued = previous.then(() => next);
        this.#pending.set(siteId, queued);
        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.#pending.get(siteId) === queued) {
                this.#pending.delete(siteId);
            }
        }
    }
}
