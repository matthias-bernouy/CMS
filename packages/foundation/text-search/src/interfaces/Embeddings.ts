export interface Embeddings {
    readonly model: string;
    initialize?(signal: AbortSignal): Promise<void>;
    embed(
        texts: readonly string[],
        kind: "query" | "passage",
        signal: AbortSignal,
    ): Promise<readonly (readonly number[])[]>;
}
export interface VectorStore {
    get(keys: readonly string[]): Promise<ReadonlyMap<string, readonly number[]>>;
    put(values: readonly { key: string; vector: readonly number[] }[]): Promise<void>;
}
