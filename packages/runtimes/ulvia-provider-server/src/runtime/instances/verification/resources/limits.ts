import { binaryByteLength, snapshotBinary } from "@bernouy/binary-media";
import { ResourceArchiveError } from "@bernouy/resources";
import type { ResourcePreparationTask } from "./protocol";

/** Estimate retained clone storage without serializing the selected contracts on the request thread. */
function metadataBytes(input: unknown): number {
    const stack = [{ value: input, depth: 0 }];
    let bytes = 0;
    let nodes = 0;
    while (stack.length) {
        const { value, depth } = stack.pop()!;
        if (++nodes > 100000 || depth > 64 || bytes > 8 * 1024 * 1024) {
            throw new ResourceArchiveError("Resource preparation metadata exceeds its limit");
        }
        if (typeof value === "string") {
            bytes += value.length * 2 + 16;
        } else if (value === null || typeof value === "boolean" || typeof value === "number") {
            bytes += 16;
        } else if (value && typeof value === "object") {
            const entries = Object.entries(value);
            if (entries.length + nodes + stack.length > 100000) {
                throw new ResourceArchiveError("Resource preparation metadata exceeds its node limit");
            }
            bytes += 32;
            for (const [key, child] of entries) {
                bytes += key.length * 2 + 16;
                stack.push({ value: child, depth: depth + 1 });
            }
        } else {
            throw new ResourceArchiveError("Invalid resource preparation metadata");
        }
    }
    if (bytes > 8 * 1024 * 1024) {
        throw new ResourceArchiveError("Resource preparation metadata exceeds its byte limit");
    }
    return bytes;
}
export function resourceTaskBytes(task: ResourcePreparationTask): number {
    if (
        (task.bytes === null) !== (task.digest === null) ||
        (task.digest !== null && !/^sha256:[0-9a-f]{64}$/u.test(task.digest))
    ) {
        throw new ResourceArchiveError("Resource preparation requires the exact archive digest");
    }
    let bytes = task.bytes === null ? 0 : binaryByteLength(task.bytes);
    if (task.kind === "resource-preview") {
        if (task.execution.selected.length > 64 || task.execution.denied.length > 512) {
            throw new ResourceArchiveError("Resource preparation execution exceeds its limit");
        }
        bytes += metadataBytes({ execution: task.execution, system: task.system });
    }
    if (bytes > 64 * 1024 * 1024) {
        throw new ResourceArchiveError("Resource preparation exceeds its retained byte limit");
    }
    return bytes;
}
export function snapshotResourceTask(task: ResourcePreparationTask): ResourcePreparationTask {
    const bytes = task.bytes === null ? null : snapshotBinary(task.bytes);
    return { ...structuredClone({ ...task, bytes: null }), bytes } as ResourcePreparationTask;
}

/** Include the captured execution/settings in every observed-byte reservation. */
export function resourceTransportReservation(task: ResourcePreparationTask, reserve: (bytes: number) => void) {
    const fixedBytes = resourceTaskBytes(task) - (task.bytes === null ? 0 : binaryByteLength(task.bytes));
    return (observedBytes: number) => reserve(fixedBytes + observedBytes);
}
