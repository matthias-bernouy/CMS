import type { VectorStore } from "../interfaces/Embeddings";

/** Optional bounded derived cache; callers retain independent corpus lifecycle and scope. */
export class MemoryVectorStore implements VectorStore {
    private readonly entries = new Map<string, readonly number[]>();
    constructor(private readonly maximumEntries = 8192) {
        if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 16384) {
            throw new TypeError("Invalid vector cache budget");
        }
    }
    async get(keys: readonly string[]) {
        return new Map(
            keys.flatMap((key) => {
                const value = this.entries.get(key);
                return value ? [[key, value] as const] : [];
            }),
        );
    }
    async put(values: readonly { key: string; vector: readonly number[] }[]) {
        for (const { key, vector } of values) {
            if (
                key.length > 128 ||
                vector.length < 1 ||
                vector.length > 4096 ||
                Array.from(vector).some((part) => !Number.isFinite(part))
            ) {
                throw new TypeError("Invalid vector cache value");
            }
            this.entries.delete(key);
            this.entries.set(key, Object.freeze([...vector]));
            while (this.entries.size > this.maximumEntries) {
                this.entries.delete(this.entries.keys().next().value!);
            }
        }
    }
}
