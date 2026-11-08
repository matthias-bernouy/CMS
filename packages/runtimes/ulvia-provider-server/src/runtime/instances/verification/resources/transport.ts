import { captureResourceBytes } from "../../../stores/resources/binary";
import type { ResourcePreparationTask, ResourceArchiveWire } from "./protocol";

export async function transferableResourceTask(
    task: ResourcePreparationTask,
    signal?: AbortSignal,
    reserve?: (bytes: number) => void,
): Promise<ResourcePreparationTask> {
    return {
        ...task,
        bytes: task.bytes instanceof Blob ? await captureResourceBytes(task.bytes, signal, reserve) : task.bytes,
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
