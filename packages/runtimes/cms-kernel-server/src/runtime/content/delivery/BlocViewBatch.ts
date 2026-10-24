import type { DeliveryRead } from "./protocol";

type Waiter = { resolve(value: string | null): void; reject(reason: unknown): void };

export class BlocViewBatch {
    readonly #pending = new Map<string, Waiter[]>();
    #scheduled = false;

    constructor(private readonly read: DeliveryRead) {}

    get(tag: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            const pending = this.#pending.get(tag) ?? [];
            pending.push({ resolve, reject });
            this.#pending.set(tag, pending);
            if (!this.#scheduled) {
                this.#scheduled = true;
                queueMicrotask(() => void this.flush());
            }
        });
    }

    private async flush(): Promise<void> {
        this.#scheduled = false;
        const batch = new Map(this.#pending);
        this.#pending.clear();
        try {
            const views = await this.read<Record<string, string | null>>("content.bloc-views", {
                tags: [...batch.keys()],
            });
            for (const [tag, waiters] of batch) {
                const view = views[tag] ?? null;
                for (const waiter of waiters) {
                    waiter.resolve(view);
                }
            }
        } catch (error) {
            for (const waiters of batch.values()) {
                for (const waiter of waiters) {
                    waiter.reject(error);
                }
            }
        }
    }
}
