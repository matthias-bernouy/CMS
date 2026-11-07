import type { VerificationTask } from "./protocol";

/** Convert immutable Blobs before crossing Bun's worker boundary. */
export async function transferableTask(task: VerificationTask): Promise<VerificationTask> {
    if (task.kind !== "artifact") {
        return task;
    }
    return {
        ...task,
        assets: await Promise.all(
            task.assets.map(async ({ id, bytes }) => ({
                id,
                bytes: bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes,
            })),
        ),
    };
}

/** The worker verifies bytes; the host retains its own immutable snapshot. No Blob crosses back. */
export function verificationValue(task: VerificationTask, value: unknown): unknown {
    if (task.kind !== "artifact") {
        return value;
    }
    return {
        ...(value as object),
        assets: task.assets.map(({ id, bytes }) => ({
            id,
            bytes: new Blob([bytes instanceof Blob ? bytes : new Uint8Array(bytes)]),
        })),
    };
}
