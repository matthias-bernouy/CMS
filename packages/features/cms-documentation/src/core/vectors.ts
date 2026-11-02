import { sha256Digest } from "@bernouy/binary-media";
import type {
    DocumentationChunk,
    DocumentationEmbeddings,
    DocumentationVectorStore,
} from "../interfaces/Documentation";
import { normalizedVector } from "./ranking";

function passage(chunk: DocumentationChunk): string {
    return `${chunk.reference.contractId} ${chunk.capabilities.slice(0, 8).join(" ")}\n${chunk.title}\n${chunk.heading}\n${chunk.content}`;
}

/** One bounded derived index, with one rebuild in flight and stable model/content cache keys. */
export class VectorIndex {
    private current?: { key: string; vectors: readonly (readonly number[])[]; checkedAt: number };
    private flight?: { key: string; promise: Promise<{ embedded: number; reused: number }> };
    private retryAt = 0;
    private readonly queries = new Set<Promise<readonly number[]>>();
    private readonly shutdown = new AbortController();
    constructor(
        private readonly model: DocumentationEmbeddings,
        private readonly store?: DocumentationVectorStore,
    ) {}

    get(key: string): readonly (readonly number[])[] | undefined {
        return this.shutdown.signal.aborted ? undefined : this.current?.key === key ? this.current.vectors : undefined;
    }

    prepare(
        key: string,
        chunks: readonly DocumentationChunk[],
        signal?: AbortSignal,
    ): Promise<{ embedded: number; reused: number }> {
        this.shutdown.signal.throwIfAborted();
        signal?.throwIfAborted();
        if (this.current?.key === key && Date.now() - this.current.checkedAt < 86_400_000) {
            return Promise.resolve({ embedded: 0, reused: chunks.length });
        }
        if (this.flight?.key === key) {
            return this.flight.promise;
        }
        if (this.flight || Date.now() < this.retryAt) {
            return Promise.reject(new Error("Semantic index is rebuilding"));
        }
        const combined = AbortSignal.any([this.shutdown.signal, ...(signal ? [signal] : [])]);
        const promise = this.build(chunks, combined)
            .then(({ vectors, embedded }) => {
                combined.throwIfAborted();
                this.current = { key, vectors, checkedAt: Date.now() };
                return { embedded, reused: chunks.length - embedded };
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

    private async build(chunks: readonly DocumentationChunk[], signal: AbortSignal) {
        await this.model.initialize?.(signal);
        signal.throwIfAborted();
        const texts = chunks.map(passage);
        const keys = await Promise.all(
            texts.map((text) => sha256Digest(new TextEncoder().encode(`${this.model.model}\0${text}`))),
        );
        const cached = (await this.store?.get(keys)) ?? new Map();
        signal.throwIfAborted();
        const vectors: (readonly number[])[] = new Array(chunks.length);
        const missing: number[] = [];
        keys.forEach((key, index) => {
            const vector = cached.get(key);
            if (vector) {
                try {
                    vectors[index] = normalizedVector(vector);
                    return;
                } catch {
                    // A corrupt optional cache entry must not prevent a rebuild.
                }
            }
            missing.push(index);
        });
        for (let start = 0; start < missing.length; start += 16) {
            signal.throwIfAborted();
            const batch = missing.slice(start, start + 16);
            const result = await this.model.embed(
                batch.map((index) => texts[index]!),
                "passage",
                AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
            );
            signal.throwIfAborted();
            if (result.length !== batch.length) {
                throw new Error("Invalid document embedding count");
            }
            const saved = batch.map((index, offset) => {
                const vector = normalizedVector(result[offset]!);
                vectors[index] = vector;
                return { key: keys[index]!, vector };
            });
            await this.store?.put(saved);
        }
        return { vectors, embedded: missing.length };
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
