import { ResourceArchiveError } from "@bernouy/resources";
import type { ResourcePreparationTask, ResourceArchiveWire } from "./protocol";

/** Files may grow after stat; observe a bounded stream before making a worker buffer. */
async function capture(blob: Blob, signal?: AbortSignal, reserve?: (bytes: number) => void): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const reader = blob.stream().getReader();
    const abort = () => {
        void reader.cancel(signal?.reason).catch(() => undefined);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const parts: Buffer[] = [];
    let size = 0;
    try {
        for (;;) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            if (done) {
                break;
            }
            size += value.byteLength;
            if (size > 64 * 1024 * 1024) {
                throw new ResourceArchiveError("Resource archive exceeds its observed byte limit");
            }
            reserve?.(size);
            parts.push(Buffer.from(value));
        }
        return Buffer.concat(parts, size);
    } finally {
        signal?.removeEventListener("abort", abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
export async function transferableResourceTask(
    task: ResourcePreparationTask,
    signal?: AbortSignal,
    reserve?: (bytes: number) => void,
): Promise<ResourcePreparationTask> {
    return {
        ...task,
        bytes: task.bytes instanceof Blob ? await capture(task.bytes, signal, reserve) : task.bytes,
    } as ResourcePreparationTask;
}
export function resourceValue(task: ResourcePreparationTask, value: unknown): unknown {
    if (task.kind === "resource-preview") {
        return value;
    }
    const wire = value as ResourceArchiveWire;
    return {
        ...wire,
        bytes: new Blob([task.bytes instanceof Blob ? task.bytes : new Uint8Array(task.bytes)]),
        assets: wire.assets.map(({ definition, bytes }) => ({ definition, bytes: new Blob([new Uint8Array(bytes)]) })),
    };
}
