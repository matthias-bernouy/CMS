import { ColdAdmission, abortableContext } from "./ColdAdmission";
import type { ColdAdmissionOptions } from "./ColdAdmission";

export type ContextPoolOptions = {
    maxEntries: number;
    maxPending: number;
    maxWaiters: number;
    idleMs?: number;
    admission?: ColdAdmissionOptions;
};
export type ContextLease<T> = { readonly context: T; release(): void };
type Entry<T> = {
    value: Promise<T>;
    leases: number;
    retired: boolean;
    lastUsed: number;
    timer?: ReturnType<typeof setTimeout>;
};

export class EdgeContextCapacityError extends Error {
    constructor() {
        super("Edge context capacity is exhausted");
    }
}

/** Hard admission bounds include pending loads and contexts still being disposed. */
export class EdgeContextPool<T> {
    private readonly idleMs: number;
    private readonly entries = new Map<string, Entry<T>>();
    private live = 0;
    private pending = 0;
    private closed = false;
    private readonly draining = new Set<Promise<void>>();
    private drained?: () => void;
    private drainFailed?: (error: unknown) => void;
    private disposalFailure?: unknown;
    private closing?: Promise<void>;
    private readonly admission?: ColdAdmission;

    constructor(
        private readonly create: (key: string) => Promise<T>,
        private readonly dispose: (value: T) => Promise<void>,
        private readonly options: ContextPoolOptions,
    ) {
        this.idleMs = options.idleMs ?? 24 * 60 * 60_000;
        for (const value of Object.values({
            maxEntries: options.maxEntries,
            maxPending: options.maxPending,
            maxWaiters: options.maxWaiters,
            idleMs: this.idleMs,
        })) {
            if (!Number.isSafeInteger(value) || value < 1) {
                throw new TypeError("Edge context bounds must be positive safe integers");
            }
        }
        this.admission = options.admission ? new ColdAdmission(options.admission) : undefined;
    }

    snapshot() {
        return {
            entries: this.entries.size,
            live: this.live,
            pending: this.pending,
            disposing: this.draining.size,
            queued: this.admission?.size ?? 0,
        };
    }

    async acquire(key: string, signal?: AbortSignal): Promise<ContextLease<T>> {
        const deadline = Date.now() + (this.options.admission?.waitMs ?? 0);
        while (true) {
            signal?.throwIfAborted();
            if (this.closed) {
                throw new Error("Edge context pool is closed");
            }
            let entry = this.entries.get(key);
            if (!entry && this.live >= this.options.maxEntries) {
                const idle = [...this.entries.entries()]
                    .filter(([, value]) => value.leases === 0)
                    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
                if (idle) {
                    await this.retire(idle[0], idle[1]);
                    signal?.throwIfAborted();
                }
                if (this.closed) {
                    throw new Error("Edge context pool is closed");
                }
                entry = this.entries.get(key);
            }
            if (!entry) {
                if (this.admission && this.pending >= this.options.maxPending && this.live < this.options.maxEntries) {
                    await this.admission.wait(deadline, signal);
                    continue;
                }
                if (this.live >= this.options.maxEntries || this.pending >= this.options.maxPending) {
                    throw new EdgeContextCapacityError();
                }
                entry = this.load(key);
            }
            if (entry.leases >= this.options.maxWaiters) {
                throw new EdgeContextCapacityError();
            }
            clearTimeout(entry.timer);
            entry.leases++;
            let released = false;
            const release = () => {
                if (!released) {
                    released = true;
                    this.release(key, entry!);
                }
            };
            try {
                return { context: await abortableContext(entry.value, signal), release };
            } catch (error) {
                release();
                throw error;
            }
        }
    }

    close(): Promise<void> {
        if (this.closing) {
            return this.closing;
        }
        this.closed = true;
        this.admission?.wake(new Error("Edge context pool is closed"));
        this.closing = new Promise((resolve, reject) => {
            this.drained = resolve;
            this.drainFailed = reject;
        });
        for (const [key, entry] of this.entries) {
            if (entry.leases === 0) {
                void this.retire(key, entry);
            }
        }
        this.finishDrain();
        return this.closing;
    }

    private load(key: string): Entry<T> {
        this.live++;
        this.pending++;
        const entry: Entry<T> = {
            value: undefined as unknown as Promise<T>,
            leases: 0,
            retired: false,
            lastUsed: Date.now(),
        };
        this.entries.set(key, entry);
        entry.value = Promise.resolve()
            .then(() => this.create(key))
            .then(
                (context) => {
                    this.pending--;
                    this.admission?.wake();
                    return context;
                },
                (error) => {
                    entry.retired = true;
                    clearTimeout(entry.timer);
                    this.pending--;
                    this.live--;
                    if (this.entries.get(key) === entry) {
                        this.entries.delete(key);
                    }
                    this.admission?.wake();
                    this.finishDrain();
                    throw error;
                },
            );
        return entry;
    }

    private release(key: string, entry: Entry<T>) {
        entry.leases--;
        entry.lastUsed = Date.now();
        if (entry.leases !== 0 || entry.retired) {
            return;
        }
        if (this.closed) {
            void this.retire(key, entry);
        } else {
            entry.timer = setTimeout(() => {
                void this.retire(key, entry);
            }, this.idleMs);
            entry.timer.unref();
        }
    }

    private retire(key: string, entry: Entry<T>): Promise<void> {
        if (entry.retired || entry.leases !== 0) {
            return Promise.resolve();
        }
        entry.retired = true;
        clearTimeout(entry.timer);
        this.entries.delete(key);
        let loaded = false;
        const task = entry.value
            .then(
                (context) => {
                    loaded = true;
                    return this.dispose(context);
                },
                () => undefined,
            )
            .catch((error) => {
                this.disposalFailure = error;
                this.closed = true;
                this.admission?.wake(new Error("Edge context pool is closed"));
            })
            .finally(() => {
                if (loaded) {
                    this.live--;
                }
                this.draining.delete(task);
                this.finishDrain();
            });
        this.draining.add(task);
        return task;
    }

    private finishDrain() {
        if (this.closed && this.live === 0 && this.draining.size === 0) {
            if (this.disposalFailure !== undefined) {
                this.drainFailed?.(this.disposalFailure);
            } else {
                this.drained?.();
            }
        }
    }
}
