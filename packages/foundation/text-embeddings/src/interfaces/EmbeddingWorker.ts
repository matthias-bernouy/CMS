export type EmbeddingModelOptions = {
    cacheDirectory: string;
    model?: string;
    revision?: string;
    threads?: number;
    localFilesOnly?: boolean;
};
export type EmbeddingWorkerCommand =
    | { action: "initialize" }
    | { action: "close" }
    | { action: "embed"; texts: string[]; kind: "query" | "passage" };
export type EmbeddingWorkerRequest = { id: number } & (
    | { action: "initialize"; options: EmbeddingModelOptions }
    | Exclude<EmbeddingWorkerCommand, { action: "initialize" }>
);
export type EmbeddingWorkerReply = {
    id: number;
    vectors?: readonly (readonly number[])[];
    error?: { name: string; message: string };
};
