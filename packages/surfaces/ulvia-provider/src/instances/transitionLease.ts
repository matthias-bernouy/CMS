import type { InstanceTransitionStore } from "./transitions";

export type ProviderInstanceTransitionExecution = Readonly<{
    signal: AbortSignal;
    throwIfLeaseLost(): void;
}>;

export class ProviderInstanceTransitionLease {
    readonly execution: ProviderInstanceTransitionExecution;
    readonly #executionAbort = new AbortController();
    readonly #heartbeatAbort = new AbortController();
    readonly #heartbeat: Promise<void>;

    constructor(store: InstanceTransitionStore, id: string, owner: string, now: () => Date, leaseMs: number) {
        this.execution = transitionExecution(this.#executionAbort.signal);
        this.#heartbeat = maintainLease(
            store,
            id,
            owner,
            now,
            leaseMs,
            this.#executionAbort,
            this.#heartbeatAbort.signal,
        );
    }

    lose(id: string): never {
        const error = new ProviderInstanceTransitionLeaseLostError(id);
        this.#executionAbort.abort(error);
        throw error;
    }

    get lost(): boolean {
        return this.#executionAbort.signal.aborted;
    }

    get reason(): unknown {
        return this.#executionAbort.signal.reason;
    }

    async stop(): Promise<void> {
        this.#heartbeatAbort.abort();
        await this.#heartbeat;
    }
}

export function transitionLeaseExpiry(now: Date, leaseMs: number): string {
    return new Date(now.getTime() + leaseMs).toISOString();
}

async function maintainLease(
    store: InstanceTransitionStore,
    id: string,
    owner: string,
    now: () => Date,
    leaseMs: number,
    executionAbort: AbortController,
    signal: AbortSignal,
): Promise<void> {
    while (!(await waitForRenewal(leaseMs / 3, signal))) {
        const current = now();
        try {
            if (!(await store.renew(id, owner, transitionLeaseExpiry(current, leaseMs), current.toISOString()))) {
                executionAbort.abort(new ProviderInstanceTransitionLeaseLostError(id));
                return;
            }
        } catch (error) {
            executionAbort.abort(error);
            return;
        }
    }
}

function transitionExecution(signal: AbortSignal): ProviderInstanceTransitionExecution {
    return {
        signal,
        throwIfLeaseLost() {
            if (signal.aborted) {
                throw signal.reason instanceof Error ? signal.reason : new Error("Provider transition lease was lost");
            }
        },
    };
}

async function waitForRenewal(milliseconds: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
        return true;
    }
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", aborted);
            resolve(false);
        }, milliseconds);
        const aborted = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        signal.addEventListener("abort", aborted, { once: true });
    });
}

class ProviderInstanceTransitionLeaseLostError extends Error {
    constructor(id: string) {
        super(`Provider transition lease was lost: ${id}`);
        this.name = "ProviderInstanceTransitionLeaseLostError";
    }
}
