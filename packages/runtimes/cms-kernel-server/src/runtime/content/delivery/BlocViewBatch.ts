import type { DeliveryRead } from "@bernouy/cms-content/delivery";

type Waiter = { resolve(value: string | null): void; reject(reason: unknown): void };

export class BlocViewBatch {
    readonly #pending = new Map<string, Waiter[]>();
    readonly #resolved = new Map<string, string | null>();
    #scheduled = false;
    #generation = 0;

    constructor(private readonly read: DeliveryRead) {}

    get(tag: string): Promise<string | null> {
        if (this.#resolved.has(tag)) {
            return Promise.resolve(this.#resolved.get(tag) ?? null);
        }
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

    prime(views: Readonly<Record<string, string | null>>): void {
        for (const [tag, view] of Object.entries(views)) {
            this.#resolved.set(tag, view);
        }
    }

    clear(): void {
        this.#generation += 1;
        this.#resolved.clear();
    }

    private async flush(): Promise<void> {
        this.#scheduled = false;
        const generation = this.#generation;
        const batch = new Map(this.#pending);
        this.#pending.clear();
        try {
            const views = await this.read("content.bloc-views", {
                tags: [...batch.keys()],
            });
            for (const [tag, waiters] of batch) {
                const view = views[tag] ?? null;
                if (generation === this.#generation) {
                    this.#resolved.set(tag, view);
                }
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
