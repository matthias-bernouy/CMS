import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { isMissing, objectPath } from "../paths";
import { syncDirectory } from "../writing";
import type { PublishStagedPackageOptions } from "./types";

export async function quarantineIfPresent(options: PublishStagedPackageOptions): Promise<void> {
    const source = objectPath(options.layout, options.digest);
    const destination = join(options.layout.corrupt, `${options.digest}-${randomUUID()}`);
    try {
        const metadata = await lstat(source);
        if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
            await makeDirectoryMovable(source, metadata);
        }
        await rename(source, destination);
        await Promise.all([syncDirectory(options.layout.objects), syncDirectory(options.layout.corrupt)]);
    } catch (error) {
        if (!isMissing(error)) {
            throw error;
        }
    }
}

export async function destinationExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isMissing(error)) {
            return false;
        }
        throw error;
    }
}

async function makeDirectoryMovable(path: string, expected: Awaited<ReturnType<typeof lstat>>): Promise<void> {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        const current = await handle.stat();
        assertSameEntry(expected, current);
        await handle.chmod(0o750);
        await handle.sync();
        assertSameEntry(current, await lstat(path));
    } finally {
        await handle.close();
    }
}

function assertSameEntry(expected: Awaited<ReturnType<typeof lstat>>, actual: Awaited<ReturnType<typeof lstat>>): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error("Integration package cache entry changed during quarantine");
    }
}
