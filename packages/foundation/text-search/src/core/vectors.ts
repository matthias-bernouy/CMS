import { buildVectors } from "./vectorBuild";
import type { Embeddings, VectorStore } from "../interfaces/Embeddings";
import { normalizedVector } from "./ranking";

/** One bounded derived index, with one rebuild in flight and stable model/content cache keys. */
export class VectorIndex {
    private current?: { key: string; vectors: readonly (readonly number[])[]; checkedAt: number };
    private flight?: { key: string; promise: Promise<{ embedded: number; reused: number }> };
    private retryAt = 0;
    private readonly queries = new Set<Promise<readonly number[]>>();
    private readonly shutdown = new AbortController();
    constructor(
        private readonly model: Embeddings,
        private readonly store?: VectorStore,
    ) {}

    get(key: string): readonly (readonly number[])[] | undefined {
        return this.shutdown.signal.aborted ? undefined : this.current?.key === key ? this.current.vectors : undefined;
    }

    prepare(
        key: string,
        texts: readonly string[],
        signal?: AbortSignal,
    ): Promise<{ embedded: number; reused: number }> {
        this.shutdown.signal.throwIfAborted();
        signal?.throwIfAborted();
        if (this.current?.key === key && Date.now() - this.current.checkedAt < 86_400_000) {
            return Promise.resolve({ embedded: 0, reused: texts.length });
        }
        if (this.flight?.key === key) {
            return this.flight.promise;
        }
        if (this.flight || Date.now() < this.retryAt) {
            return Promise.reject(new Error("Semantic index is rebuilding"));
        }
        const combined = AbortSignal.any([this.shutdown.signal, ...(signal ? [signal] : [])]);
        const promise = buildVectors(this.model, this.store, texts, combined)
            .then(({ vectors, embedded }) => {
                combined.throwIfAborted();
                this.current = { key, vectors, checkedAt: Date.now() };
                return { embedded, reused: texts.length - embedded };
            })
            .catch((error) => {
                this.retryAt = Date.now() + 30_000;
                throw error;
            })
            .finally(() => {
                this.flight = undefined;
            });
        this.flight = { key, promise };
        return promise;
    }

    query(text: string): Promise<readonly number[]> {
        if (this.shutdown.signal.aborted || this.queries.size >= 4) {
            return Promise.reject(new Error("Embedding query unavailable"));
        }
        const promise = (async () => {
            const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(10_000)]);
            const result = await this.model.embed([text], "query", signal);
            signal.throwIfAborted();
            if (result.length !== 1) {
                throw new Error("Invalid query embedding count");
            }
            return normalizedVector(result[0]!);
        })().finally(() => {
            this.queries.delete(promise);
        });
        this.queries.add(promise);
        return promise;
    }

    async close(): Promise<void> {
        this.shutdown.abort();
        await Promise.allSettled([...(this.flight ? [this.flight.promise] : []), ...this.queries]);
        this.current = undefined;
    }
}

export async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("Semantic search deadline exceeded")), milliseconds);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
