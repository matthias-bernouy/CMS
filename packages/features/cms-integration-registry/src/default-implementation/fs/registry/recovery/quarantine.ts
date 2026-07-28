import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { FsIntegrationRegistryLayout } from "../persistence/layout";
import { syncDirectory } from "../persistence/canonicalFile";
import { chmodVerifiedRegistryDirectory } from "../persistence/ownedDirectory";

export async function quarantineRegistryPath(
    layout: FsIntegrationRegistryLayout,
    namespace: string,
    label: string,
    source: string,
): Promise<string | null> {
    let metadata;
    try {
        metadata = await lstat(source);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
    const safeNamespace = safeName(namespace);
    const directory = join(layout.quarantine, safeNamespace);
    try {
        await mkdir(directory, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const directoryMetadata = await lstat(directory);
    if (
        directoryMetadata.isSymbolicLink() ||
        !directoryMetadata.isDirectory() ||
        (await realpath(directory)) !== directory
    ) {
        throw new Error(`Integration registry quarantine namespace must be a real direct child: ${directory}`);
    }
    let destination = join(directory, safeName(label || basename(source)));
    let attempt = 0;
    while (await exists(destination)) {
        attempt += 1;
        destination = join(directory, `${safeName(label || basename(source))}-${attempt}`);
    }
    if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        await chmodVerifiedRegistryDirectory(source, 0o750, { dev: metadata.dev, ino: metadata.ino });
    }
    await rename(source, destination);
    await syncDirectory(dirname(source));
    await syncDirectory(directory);
    return destination;
}

function safeName(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
        return value;
    }
    return `entry-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
