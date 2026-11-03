import type { EmbeddingModelOptions } from "../../interfaces/EmbeddingWorker";

export const DEFAULT_EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const DEFAULT_EMBEDDING_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";

export function modelIdentifier(options: EmbeddingModelOptions): string {
    if (
        Boolean(options.model) !== Boolean(options.revision) ||
        (options.model && !/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/u.test(options.model)) ||
        (options.revision && !/^[0-9a-f]{40}$/u.test(options.revision))
    ) {
        throw new TypeError("Embedding models require an exact revision");
    }
    if (
        options.threads !== undefined &&
        (!Number.isSafeInteger(options.threads) || options.threads < 1 || options.threads > 8)
    ) {
        throw new TypeError("Embedding thread budget must be between one and eight");
    }
    return `${options.model ?? DEFAULT_EMBEDDING_MODEL}@${options.revision ?? DEFAULT_EMBEDDING_REVISION}:q8:e5-prefix:mean:v1`;
}
