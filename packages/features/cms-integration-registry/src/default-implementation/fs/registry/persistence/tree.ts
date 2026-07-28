import { randomUUID } from "node:crypto";
import { lstat, opendir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
    assertVerifiedRegistryDirectory,
    chmodVerifiedRegistryDirectory,
    type FsRegistryDirectoryIdentity,
} from "./ownedDirectory";
import { syncDirectory } from "./canonicalFile";

export async function removeImmutableTreeIfExists(path: string): Promise<void> {
    let metadata;
    try {
        metadata = await lstat(path);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return;
        }
        throw error;
    }
    if (metadata.isSymbolicLink()) {
        throw new Error(`Refusing to clean a symlinked integration registry tree: ${path}`);
    }
    const parent = dirname(path);
    const detached = join(parent, `.${basename(path)}.${randomUUID()}.cleanup`);
    await rename(path, detached);
    await syncDirectory(parent);
    const detachedMetadata = await lstat(detached);
    if (metadata.dev !== detachedMetadata.dev || metadata.ino !== detachedMetadata.ino) {
        throw new Error(`Integration registry cleanup target changed before it could be detached: ${path}`);
    }
    if (detachedMetadata.isDirectory()) {
        await makeWritable(detached, { dev: detachedMetadata.dev, ino: detachedMetadata.ino });
    }
    await rm(detached, { recursive: true });
    await syncDirectory(parent);
}

async function makeWritable(path: string, expected: FsRegistryDirectoryIdentity): Promise<void> {
    const identity = await chmodVerifiedRegistryDirectory(path, 0o750, expected);
    const handle = await opendir(path);
    for await (const entry of handle) {
        const child = join(path, entry.name);
        const metadata = await lstat(child);
        if (metadata.isSymbolicLink()) {
            throw new Error(`Refusing to clean a symlinked integration registry entry: ${child}`);
        }
        if (metadata.isDirectory()) {
            await makeWritable(child, { dev: metadata.dev, ino: metadata.ino });
        }
    }
    await assertVerifiedRegistryDirectory(path, identity);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
