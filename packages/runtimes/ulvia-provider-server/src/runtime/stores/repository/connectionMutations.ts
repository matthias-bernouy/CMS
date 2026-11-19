import type { SecretStore } from "@bernouy/secret-store";

type WaitingMutation = { start(): void; timer: ReturnType<typeof setTimeout> };

/** Serialize verified credential changes; expired queued work never starts later. */
export class ConnectionMutationQueue {
    private active = false;
    private readonly pending: WaitingMutation[] = [];
    constructor(
        private readonly maxPending = 32,
        private readonly waitMs = 30_000,
        private readonly idle?: () => void,
    ) {
        if (!Number.isSafeInteger(maxPending) || maxPending < 1 || !Number.isSafeInteger(waitMs) || waitMs < 1) {
            throw new TypeError("Repository connection queue bounds must be positive safe integers");
        }
    }

    run<T>(operation: () => Promise<T>): Promise<T> {
        if (!this.active) {
            this.active = true;
            return this.execute(operation);
        }
        if (this.pending.length >= this.maxPending) {
            return Promise.reject(new Error("Repository connection change capacity is exhausted"));
        }
        return new Promise<T>((resolve, reject) => {
            const entry: WaitingMutation = {
                start: () => {
                    void this.execute(operation).then(resolve, reject);
                },
                timer: setTimeout(() => {
                    const index = this.pending.indexOf(entry);
                    if (index >= 0) {
                        this.pending.splice(index, 1);
                        reject(new Error("Repository connection change wait expired"));
                    }
                }, this.waitMs),
            };
            this.pending.push(entry);
        });
    }

    private async execute<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } finally {
            const next = this.pending.shift();
            if (next) {
                clearTimeout(next.timer);
                next.start();
            } else {
                this.active = false;
                this.idle?.();
            }
        }
    }
}

const stores = new WeakMap<SecretStore, ConnectionMutationQueue>();
const scopes = new Map<string, ConnectionMutationQueue>();

/** Runtime database identity keeps separately opened adapters for one instance coordinated. */
export function mutateConnection<T>(
    store: SecretStore,
    scope: string | undefined,
    operation: () => Promise<T>,
): Promise<T> {
    let queue = scope === undefined ? stores.get(store) : scopes.get(scope);
    if (!queue) {
        queue = new ConnectionMutationQueue(32, 30_000, () => {
            if (scope !== undefined && scopes.get(scope) === queue) {
                scopes.delete(scope);
            }
        });
        if (scope === undefined) {
            stores.set(store, queue);
        } else {
            scopes.set(scope, queue);
        }
    }
    return queue.run(operation);
}
