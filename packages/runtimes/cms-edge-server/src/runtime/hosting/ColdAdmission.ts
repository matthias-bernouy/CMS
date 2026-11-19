export type ColdAdmissionOptions = { maxQueued: number; waitMs: number };
type Waiter = { finish(error?: unknown): void };

/** Retain only bounded ingress waiters, never additional contexts or parallel loads. */
export class ColdAdmission {
    private readonly waiters = new Set<Waiter>();
    constructor(readonly options: ColdAdmissionOptions) {
        for (const value of Object.values(options)) {
            if (!Number.isSafeInteger(value) || value < 1) {
                throw new TypeError("Edge cold admission bounds must be positive safe integers");
            }
        }
    }
    get size() {
        return this.waiters.size;
    }
    wait(deadline: number, signal?: AbortSignal): Promise<void> {
        signal?.throwIfAborted();
        if (this.waiters.size >= this.options.maxQueued) {
            return Promise.reject(new Error("Edge cold admission capacity is exhausted"));
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            return Promise.reject(new Error("Edge cold admission wait expired"));
        }
        return new Promise((resolve, reject) => {
            const abort = () => waiter.finish(signal!.reason);
            const timer = setTimeout(() => waiter.finish(new Error("Edge cold admission wait expired")), remaining);
            const waiter: Waiter = {
                finish: (error) => {
                    if (!this.waiters.delete(waiter)) {
                        return;
                    }
                    clearTimeout(timer);
                    signal?.removeEventListener("abort", abort);
                    if (error === undefined) {
                        resolve();
                    } else {
                        reject(error);
                    }
                },
            };
            this.waiters.add(waiter);
            signal?.addEventListener("abort", abort, { once: true });
        });
    }
    wake(error?: unknown) {
        for (const waiter of this.waiters) {
            waiter.finish(error);
        }
    }
}

export async function abortableContext<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return value;
    }
    signal.throwIfAborted();
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
    });
    try {
        return await Promise.race([value, cancelled]);
    } finally {
        signal.removeEventListener("abort", abort);
    }
}
