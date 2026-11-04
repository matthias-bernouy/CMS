import type { Subprocess } from "bun";
import { spawnModelProcess } from "./transformers/process";
import type { Embeddings } from "@bernouy/text-search";
import type { EmbeddingModelOptions, EmbeddingWorkerCommand } from "../interfaces/EmbeddingWorker";
import { modelIdentifier } from "./transformers/options";

type Vectors = readonly (readonly number[])[] | undefined;

/** One model process per runtime keeps tokenization and native inference off the HTTP event loop. */
export class TransformersEmbeddings implements Embeddings {
    readonly model: string;
    private worker?: Subprocess<"ignore", "ignore", "inherit">;
    private workerExit?: Promise<number>;
    private initializing?: Promise<void>;
    private closing?: Promise<void>;
    private closed = false;
    private active = 0;
    private sequence = 0;
    private retryAt = 0;
    private readonly idle = new Set<() => void>();
    private readonly pending = new Map<number, { resolve(value: Vectors): void; reject(error: Error): void }>();
    constructor(private readonly options: EmbeddingModelOptions) {
        this.model = modelIdentifier(options);
    }

    async initialize(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        if (this.closed || Date.now() < this.retryAt) {
            throw new Error("Embedding model unavailable");
        }
        this.initializing ??= (async () => {
            await this.call({ action: "initialize" });
        })().catch((error) => {
            this.initializing = undefined;
            this.retryAt = Date.now() + 30_000;
            throw error;
        });
        await this.initializing;
        signal.throwIfAborted();
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
            // close() waits for this admitted slot, including initialization and native work.
            const result = await this.call({ action: "embed", texts: [...texts], kind });
            signal.throwIfAborted();
            if (!result || result.length !== texts.length) {
                throw new TypeError("Invalid model worker response");
            }
            return result;
        } finally {
            this.active--;
            if (!this.active) {
                this.idle.forEach((resolve) => resolve());
                this.idle.clear();
            }
        }
    }

    close(): Promise<void> {
        this.closed = true;
        this.closing ??= (async () => {
            if (this.active) {
                await new Promise<void>((resolve) => {
                    this.idle.add(resolve);
                });
            }
            await this.initializing?.catch(() => undefined);
            try {
                if (this.worker) {
                    await this.call({ action: "close" });
                }
            } finally {
                const code = await this.workerExit;
                if (code !== undefined && code !== 0) {
                    throw new Error(`Embedding process did not exit cleanly (${code})`);
                }
            }
        })();
        return this.closing;
    }

    private call(input: EmbeddingWorkerCommand): Promise<Vectors> {
        if (!this.worker) {
            const worker = spawnModelProcess((reply) => {
                const pending = this.pending.get(reply.id);
                this.pending.delete(reply.id);
                if (reply.error) {
                    pending?.reject(Object.assign(new Error(reply.error.message), { name: reply.error.name }));
                } else {
                    pending?.resolve(reply.vectors);
                }
            });
            this.worker = worker;
            this.workerExit = worker.exited;
            const failed = (error: Error) => {
                if (this.worker !== worker) {
                    return;
                }
                this.worker = undefined;
                this.initializing = undefined;
                this.retryAt = Date.now() + 30_000;
                this.pending.forEach((pending) => pending.reject(error));
                this.pending.clear();
            };
            void worker.exited.then((code) => failed(new Error(`Embedding process exited (${code})`)));
        }
        const id = ++this.sequence;
        return new Promise<Vectors>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            try {
                this.worker!.send({
                    ...input,
                    id,
                    ...(input.action === "initialize" ? { options: this.options } : {}),
                });
            } catch (error) {
                this.pending.delete(id);
                reject(error);
            }
        });
    }
}
