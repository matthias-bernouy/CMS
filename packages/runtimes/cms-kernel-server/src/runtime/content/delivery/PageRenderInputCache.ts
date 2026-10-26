import type { DeliveryRead } from "@bernouy/cms-content/delivery";
import { decodePageRenderInputs, type DeliveredPageRenderInputs } from "./protocol";

export class PageRenderInputCache {
    readonly #cache = new Map<string, CacheEntry>();
    readonly #pending = new Map<string, Promise<DeliveredPageRenderInputs>>();
    readonly #freshForMs: number;
    readonly #staleForMs: number;
    readonly #now: () => number;
    #generation = 0;

    constructor(
        private readonly read: DeliveryRead,
        options: PageRenderInputCacheOptions = {},
    ) {
        const freshForMs = options.freshForMs ?? 30_000;
        const staleForMs = options.staleForMs ?? 300_000;
        if (!Number.isFinite(freshForMs) || freshForMs < 0 || !Number.isFinite(staleForMs) || staleForMs < freshForMs) {
            throw new TypeError("Page render cache durations are invalid");
        }
        this.#freshForMs = freshForMs;
        this.#staleForMs = staleForMs;
        this.#now = options.now ?? Date.now;
    }

    async get(path: string): Promise<DeliveredPageRenderInputs> {
        const cached = this.#cache.get(path);
        if (cached && this.#now() - cached.validatedAt < this.#freshForMs) {
            return cached.inputs;
        }
        if (cached && this.#now() - cached.validatedAt < this.#staleForMs) {
            this.refreshInBackground(path, cached);
            return cached.inputs;
        }
        const existing = this.#pending.get(path);
        if (existing) {
            return existing;
        }
        const generation = this.#generation;
        const pending = this.refresh(path, cached, generation).finally(() => {
            if (this.#pending.get(path) === pending) {
                this.#pending.delete(path);
            }
        });
        this.#pending.set(path, pending);
        return pending;
    }

    private refreshInBackground(path: string, cached: CacheEntry): void {
        if (this.#pending.has(path)) {
            return;
        }
        const generation = this.#generation;
        const pending = this.refresh(path, cached, generation)
            .catch(() => cached.inputs)
            .finally(() => {
                if (this.#pending.get(path) === pending) {
                    this.#pending.delete(path);
                }
            });
        this.#pending.set(path, pending);
    }

    invalidate(): void {
        this.#generation += 1;
        this.#cache.clear();
        this.#pending.clear();
    }

    private async refresh(
        path: string,
        cached: CacheEntry | undefined,
        generation: number,
    ): Promise<DeliveredPageRenderInputs> {
        if (cached) {
            const artifactRevision = await this.read("content.page-render-revision", { path });
            if (cached.inputs.artifactRevision === artifactRevision) {
                if (generation === this.#generation) {
                    this.#cache.set(path, { inputs: cached.inputs, validatedAt: this.#now() });
                }
                return cached.inputs;
            }
        }
        const inputs = decodePageRenderInputs(await this.read("content.page-render-inputs", { path }));
        if (generation === this.#generation) {
            this.#cache.set(path, { inputs, validatedAt: this.#now() });
        }
        return inputs;
    }
}

type CacheEntry = {
    readonly inputs: DeliveredPageRenderInputs;
    readonly validatedAt: number;
};

export type PageRenderInputCacheOptions = {
    readonly freshForMs?: number;
    readonly staleForMs?: number;
    readonly now?: () => number;
};
