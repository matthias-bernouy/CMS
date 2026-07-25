import { chmod, lstat, opendir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationPackageCacheLayout } from "./paths";
import { assertWithinCache, isMissing } from "./paths";

export async function cleanupAbandonedStaging(
    layout: IntegrationPackageCacheLayout,
    safetyAgeMs: number,
    now: number,
): Promise<void> {
    if (!Number.isSafeInteger(safetyAgeMs) || safetyAgeMs < 0) {
        throw new TypeError("Integration package staging safety age must be a non-negative safe integer");
    }
    const handle = await opendir(layout.staging);
    for await (const entry of handle) {
        const path = join(layout.staging, entry.name);
        let metadata;
        try {
            metadata = await lstat(path);
        } catch (error) {
            if (isMissing(error)) {
                continue;
            }
            throw error;
        }
        if (now - metadata.mtimeMs >= safetyAgeMs) {
            await removeCacheTree(layout, path);
        }
    }
}

export async function removeCacheTree(layout: IntegrationPackageCacheLayout, path: string): Promise<void> {
    assertWithinCache(layout.root, path);
    try {
        await makeOwnerWritable(path);
        await rm(path, { recursive: true, force: true });
    } catch (error) {
        if (!isMissing(error)) {
            throw error;
        }
    }
}

async function makeOwnerWritable(path: string): Promise<void> {
    let metadata;
    try {
        metadata = await lstat(path);
    } catch (error) {
        if (isMissing(error)) {
            return;
        }
        throw error;
    }
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    if (!metadata.isDirectory()) {
        await chmod(path, 0o600);
        return;
    }
    await chmod(path, 0o700);
    const handle = await opendir(path);
    for await (const entry of handle) {
        await makeOwnerWritable(join(path, entry.name));
    }
}
