import { snapshotResourceTask, resourceTransportReservation } from "./resources/limits";
import { resourcePreparationFor } from "./resources/ports";
import { transferableTask, verificationValue } from "./transport";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { Worker } from "node:worker_threads";
import type { CollectionVerifier } from "@bernouy/repository/collections/sources";
import type { VerificationTask, VerificationReply } from "./protocol";
import { taskBytes, verificationError } from "./limits";

type Pending = {
    id: number;
    task: VerificationTask;
    bytes: number;
    resolve(value: unknown): void;
    reject(error: unknown): void;
    detach(): void;
    timer?: ReturnType<typeof setTimeout>;
    readonly transportAbort: AbortController;
    transportPending?: boolean;
    releaseAfterTransport?: boolean;
};

/** One CPU worker per host, shared by instances; never executes authored JavaScript. */
export class HostPreparationPool implements CollectionVerifier {
    private worker?: Worker;
    private ready = false;
    private stopping?: Promise<void>;
    private sending?: Promise<void>;
    private active?: Pending;
    private queue: Pending[] = [];
    private bytes = 0;
    private nextId = 0;
    private closed = false;

    constructor(private readonly timeoutMs = 30_000) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
            throw new TypeError("Invalid host preparation timeout");
        }
    }

    readonly resources = resourcePreparationFor((task, signal) => this.submit(task, signal));

    readonly metadataJson: CollectionVerifier["metadataJson"] = (value, digest, signal, limits) =>
        this.submit(
            { kind: "json", value: typeof value === "string" ? value : new Uint8Array(value), digest, limits },
            signal,
        );
    readonly metadata: CollectionVerifier["metadata"] = (value, digest, signal, limits) =>
        this.submit({ kind: "metadata", value, digest, limits }, signal);
    readonly artifact: CollectionVerifier["artifact"] = (value, assets, digest, signal, limits) =>
        this.submit({ kind: "artifact", value, assets, digest, limits }, signal);
    readonly evolution: CollectionVerifier["evolution"] = (previous, next, signal) =>
        this.submit({ kind: "evolution", previous, next }, signal);

    stats() {
        return { active: Boolean(this.active), queued: this.queue.length, bytes: this.bytes };
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const job of this.queue.splice(0)) {
            this.finish(job, new Error("Host preparation closed"));
        }
        this.reset(new Error("Host preparation closed"));
        await this.stopping;
        await this.sending;
    }

    private submit<T>(task: VerificationTask, signal?: AbortSignal): Promise<T> {
        try {
            signal?.throwIfAborted();
            const bytes = taskBytes(task);
            if (this.closed || this.queue.length >= 8 || this.bytes + bytes > 64 * 1024 * 1024) {
                throw Object.assign(new Error("Host preparation capacity unavailable"), { status: 503 });
            }
            const snapshot: VerificationTask =
                task.kind === "resource-archive" || task.kind === "resource-preview"
                    ? snapshotResourceTask(task)
                    : task.kind === "artifact"
                      ? {
                            ...structuredClone({ ...task, assets: [] }),
                            assets: task.assets.map(({ id, bytes }) => ({
                                id,
                                bytes: bytes instanceof Blob ? bytes : new Uint8Array(bytes),
                            })),
                        }
                      : structuredClone(task);
            return new Promise<T>((resolve, reject) => {
                const job: Pending = {
                    id: ++this.nextId,
                    transportAbort: new AbortController(),
                    task: snapshot,
                    bytes,
                    resolve: (value) => resolve(value as T),
                    reject,
                    detach: () => signal?.removeEventListener("abort", abort),
                };
                const abort = () => {
                    if (this.active === job) {
                        this.reset(signal!.reason);
                    } else {
                        const index = this.queue.indexOf(job);
                        if (index >= 0) {
                            this.queue.splice(index, 1);
                            this.finish(job, signal!.reason);
                        }
                    }
                };
                this.bytes += bytes;
                this.queue.push(job);
                signal?.addEventListener("abort", abort, { once: true });
                if (signal?.aborted) {
                    abort();
                }
                this.pump();
            });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private pump(): void {
        if (this.closed || this.active || this.stopping || this.sending || !this.queue.length) {
            return;
        }
        const job = this.queue.shift()!;
        this.active = job;
        try {
            if (!this.worker) {
                const worker = new Worker(new URL("./worker.ts", import.meta.url), { env: {} });
                this.worker = worker;
                worker.on("message", (reply: VerificationReply) => {
                    if (this.worker === worker && reply.id === 0) {
                        this.ready = true;
                        if (this.active) {
                            this.send(worker, this.active);
                        }
                        return;
                    }
                    if (this.worker !== worker || this.active?.id !== reply.id) {
                        return;
                    }
                    const active = this.active;
                    this.active = undefined;
                    this.finish(
                        active,
                        reply.error ? verificationError(reply.error) : undefined,
                        reply.error ? undefined : deepFreeze(verificationValue(active.task, reply.value)),
                    );
                    this.pump();
                });
                worker.on("error", (error) => {
                    if (this.worker === worker) {
                        this.reset(error);
                    }
                });
                worker.on("exit", () => {
                    if (this.worker === worker) {
                        this.reset(new Error("Host preparation worker exited"));
                    }
                });
            }
            job.timer = setTimeout(
                () => this.reset(Object.assign(new Error("Host preparation timed out"), { status: 503 })),
                this.timeoutMs,
            );
            if (this.ready) {
                this.send(this.worker, job);
            }
        } catch (error) {
            this.reset(error);
        }
    }

    private send(worker: Worker, job: Pending): void {
        job.transportPending = true;
        const reserve = (bytes: number) => {
            if (this.active !== job || job.transportAbort.signal.aborted) {
                throw new Error("Host preparation transport no longer owns its job");
            }
            this.resize(job, Math.max(job.bytes, bytes));
        };
        const observe =
            job.task.kind === "resource-archive" || job.task.kind === "resource-preview"
                ? resourceTransportReservation(job.task, reserve)
                : undefined;
        const sending = transferableTask(job.task, job.transportAbort.signal, observe)
            .then((task) => {
                if (this.worker === worker && this.active === job) {
                    this.resize(job, taskBytes(task));
                    job.task = task;
                    worker.postMessage({ id: job.id, task });
                }
            })
            .catch((error) => {
                if (this.worker === worker && this.active === job) {
                    this.reset(error);
                }
            })
            .finally(() => {
                job.transportPending = false;
                if (job.releaseAfterTransport) {
                    this.bytes -= job.bytes;
                }
                if (this.sending === sending) {
                    this.sending = undefined;
                }
                this.pump();
            });
        this.sending = sending;
    }

    private resize(job: Pending, bytes: number): void {
        if (this.bytes - job.bytes + bytes > 64 * 1024 * 1024) {
            throw Object.assign(new Error("Host preparation capacity unavailable"), { status: 503 });
        }
        this.bytes += bytes - job.bytes;
        job.bytes = bytes;
    }

    private finish(job: Pending, error?: unknown, value?: unknown): void {
        clearTimeout(job.timer);
        job.detach();
        if (job.transportPending) {
            job.releaseAfterTransport = true;
        } else {
            this.bytes -= job.bytes;
        }
        if (error !== undefined) {
            job.reject(error);
        } else {
            job.resolve(value);
        }
    }

    private reset(error: unknown): void {
        const worker = this.worker;
        this.worker = undefined;
        this.ready = false;
        if (this.active) {
            const active = this.active;
            this.active = undefined;
            active.transportAbort.abort(error);
            this.finish(active, error);
        }
        if (worker) {
            this.stopping = worker
                .terminate()
                .then(() => undefined)
                .finally(() => {
                    this.stopping = undefined;
                    this.pump();
                });
        }
    }
}
