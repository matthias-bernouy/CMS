export type ResourceLease<T> = Readonly<{
    resource: T;
    release(): void;
}>;

export type ResourceLifetime = Readonly<{
    retain(): () => void;
}>;

type Timer = ReturnType<typeof setTimeout>;

type PoolEntry<T> = {
    resource: Promise<T>;
    leases: number;
    lastUsed: number;
    timer?: Timer;
};

/** Bounds instance resources and closes idle entries without interrupting active requests. */
export class InstanceResourcePool<T> {
    readonly #entries = new Map<string, PoolEntry<T>>();

    constructor(
        private readonly create: (key: string, lifetime: ResourceLifetime) => Promise<T>,
        private readonly dispose: (resource: T) => Promise<void>,
        private readonly options: Readonly<{ maxEntries: number; idleMs: number }>,
    ) {
        if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1) {
            throw new TypeError("Instance resource pool maxEntries must be a positive safe integer");
        }
        if (!Number.isSafeInteger(options.idleMs) || options.idleMs < 1) {
            throw new TypeError("Instance resource pool idleMs must be a positive safe integer");
        }
    }

    async acquire(key: string): Promise<ResourceLease<T>> {
        let entry = this.#entries.get(key);
        if (!entry) {
            entry = { resource: undefined as unknown as Promise<T>, leases: 0, lastUsed: Date.now() };
            this.#entries.set(key, entry);
            entry.resource = this.create(key, { retain: () => this.#retain(key, entry!) });
            entry.resource.catch(() => {
                if (this.#entries.get(key) === entry) {
                    this.#entries.delete(key);
                }
            });
        }
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        entry.leases += 1;
        let resource: T;
        try {
            resource = await entry.resource;
        } catch (error) {
            entry.leases -= 1;
            throw error;
        }
        await this.#evictOverflow(key);
        let released = false;
        return {
            resource,
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                this.#release(key, entry!);
            },
        };
    }

    #retain(key: string, entry: PoolEntry<T>): () => void {
        if (this.#entries.get(key) !== entry) {
            throw new Error(`Cannot retain a disposing instance resource: ${key}`);
        }
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        entry.leases += 1;
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            this.#release(key, entry);
        };
    }

    async close(): Promise<void> {
        const entries = [...this.#entries.entries()];
        this.#entries.clear();
        await Promise.allSettled(entries.map(([, entry]) => this.#disposeEntry(entry)));
    }

    #release(key: string, entry: PoolEntry<T>): void {
        entry.leases -= 1;
        entry.lastUsed = Date.now();
        if (entry.leases !== 0 || this.#entries.get(key) !== entry) {
            return;
        }
        entry.timer = setTimeout(() => void this.#evict(key, entry).catch(() => undefined), this.options.idleMs);
        entry.timer.unref?.();
        void this.#evictOverflow();
    }

    async #evictOverflow(protectedKey?: string): Promise<void> {
        while (this.#entries.size > this.options.maxEntries) {
            const candidate = [...this.#entries.entries()]
                .filter(([key, entry]) => key !== protectedKey && entry.leases === 0)
                .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
            if (!candidate) {
                return;
            }
            await this.#evict(candidate[0], candidate[1]);
        }
    }

    async #evict(key: string, entry: PoolEntry<T>): Promise<void> {
        if (entry.leases !== 0 || this.#entries.get(key) !== entry) {
            return;
        }
        this.#entries.delete(key);
        await this.#disposeEntry(entry);
    }

    async #disposeEntry(entry: PoolEntry<T>): Promise<void> {
        if (entry.timer) {
            clearTimeout(entry.timer);
        }
        await this.dispose(await entry.resource);
    }
}
