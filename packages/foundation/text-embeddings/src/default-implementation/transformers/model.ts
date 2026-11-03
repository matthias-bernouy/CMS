import type { Embeddings } from "@bernouy/text-search";
import { normalizedVector } from "@bernouy/text-search";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_REVISION, modelIdentifier } from "./options";
import type { EmbeddingModelOptions } from "../../interfaces/EmbeddingWorker";
type Extractor = {
    (
        texts: string[],
        options: { pooling: "mean"; normalize: true },
    ): Promise<{ tolist(): unknown; dispose(): Promise<void> | void }>;
    dispose(): Promise<void>;
};

/** Lazy CPU model shared by the runtime; neither secrets nor a hosted inference account are required. */
export class TransformersModel implements Embeddings {
    readonly model: string;
    private extractor?: Promise<Extractor>;
    private active = 0;
    private closed = false;
    private retryAt = 0;
    private closing?: Promise<void>;
    private readonly idle = new Set<() => void>();
    constructor(private readonly options: EmbeddingModelOptions) {
        this.model = modelIdentifier(options);
    }

    async initialize(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        if (this.closed || Date.now() < this.retryAt) {
            throw new Error("Embedding model unavailable");
        }
        this.extractor ??= this.load().catch((error) => {
            this.extractor = undefined;
            this.retryAt = Date.now() + 30_000;
            throw error;
        });
        await this.extractor;
        signal.throwIfAborted();
    }

    close(): Promise<void> {
        this.closed = true;
        this.closing ??= (async () => {
            if (this.active) {
                await new Promise<void>((resolve) => {
                    this.idle.add(resolve);
                });
            }
            const extractor = await this.extractor?.catch(() => undefined);
            await extractor?.dispose();
            this.extractor = undefined;
        })();
        return this.closing;
    }

    async embed(
        texts: readonly string[],
        kind: "query" | "passage",
        signal: AbortSignal,
    ): Promise<readonly (readonly number[])[]> {
        signal.throwIfAborted();
        if (texts.length < 1 || texts.length > 16 || texts.some((text) => text.length > 4096)) {
            throw new TypeError("Embedding input budget exceeded");
        }
        if (this.closed || this.active >= 4) {
            throw new Error("Embedding concurrency budget exceeded");
        }
        this.active++;
        try {
            await this.initialize(signal);
            const extractor = (await this.extractor)!;
            signal.throwIfAborted();
            const output = await extractor(
                texts.map((text) => `${kind}: ${text}`),
                { pooling: "mean", normalize: true },
            );
            try {
                const result = output.tolist();
                signal.throwIfAborted();
                if (!Array.isArray(result) || result.length !== texts.length) {
                    throw new TypeError("Invalid embedding model response");
                }
                return result.map((vector) => normalizedVector(vector));
            } finally {
                await output.dispose();
            }
        } finally {
            // Retain the slot until native inference actually finishes, even after a caller times out.
            this.active--;
            if (!this.active) {
                this.idle.forEach((resolve) => resolve());
                this.idle.clear();
            }
        }
    }

    private async load(): Promise<Extractor> {
        const { pipeline } = await import("@huggingface/transformers");
        const options = {
            revision: this.options.revision ?? DEFAULT_EMBEDDING_REVISION,
            cache_dir: this.options.cacheDirectory,
            dtype: "q8" as const,
            device: "cpu" as const,
            ...(this.options.threads
                ? { session_options: { intraOpNumThreads: this.options.threads, interOpNumThreads: 1 } }
                : {}),
        };
        const model = this.options.model ?? DEFAULT_EMBEDDING_MODEL;
        const directory = resolve(this.options.cacheDirectory, model, options.revision);
        const files = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
        const cached = (
            await Promise.all(
                files.map(async (file) => {
                    const info = await stat(join(directory, file)).catch(() => null);
                    return Boolean(info?.isFile() && info.size);
                }),
            )
        ).every(Boolean);
        if (this.options.localFilesOnly && !cached) {
            throw new Error("Pinned embedding model files are not cached");
        }
        // Transformers v4 tokenizer discovery ignores cache/revision options; a local path avoids that remote probe.
        return (await pipeline("feature-extraction", cached ? directory : model, {
            ...options,
            local_files_only: cached,
        })) as unknown as Extractor;
    }
}
