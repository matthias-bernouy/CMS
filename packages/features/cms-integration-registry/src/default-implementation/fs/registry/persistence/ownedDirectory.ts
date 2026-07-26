import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { join } from "node:path";

export type FsRegistryDirectoryIdentity = Pick<Stats, "dev" | "ino">;

export async function chmodVerifiedRegistryDirectory(
    path: string,
    mode: number,
    expected?: FsRegistryDirectoryIdentity,
): Promise<FsRegistryDirectoryIdentity> {
    const pathMetadata = await lstat(path);
    assertRealDirectory(pathMetadata, path);
    if (expected) {
        assertSameEntry(expected, pathMetadata, path);
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        const handleMetadata = await handle.stat();
        assertRealDirectory(handleMetadata, path);
        assertSameEntry(pathMetadata, handleMetadata, path);
        await handle.chmod(mode);
        assertSameEntry(handleMetadata, await handle.stat(), path);
        const after = await lstat(path);
        assertRealDirectory(after, path);
        assertSameEntry(handleMetadata, after, path);
        return { dev: handleMetadata.dev, ino: handleMetadata.ino };
    } finally {
        await handle.close();
    }
}

export async function readVerifiedRegistryDirectory(path: string): Promise<FsRegistryDirectoryIdentity> {
    const metadata = await lstat(path);
    assertRealDirectory(metadata, path);
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        const handleMetadata = await handle.stat();
        assertRealDirectory(handleMetadata, path);
        assertSameEntry(metadata, handleMetadata, path);
        return { dev: handleMetadata.dev, ino: handleMetadata.ino };
    } finally {
        await handle.close();
    }
}

export async function ensureVerifiedRegistryChildDirectory(parent: string, name: string): Promise<string> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name)) {
        throw new TypeError("Integration registry directory name must be a path-safe identifier");
    }
    await readVerifiedRegistryDirectory(parent);
    const path = join(parent, name);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    await readVerifiedRegistryDirectory(path);
    return path;
}

export async function assertVerifiedRegistryDirectory(
    path: string,
    expected: FsRegistryDirectoryIdentity,
): Promise<void> {
    const metadata = await lstat(path);
    assertRealDirectory(metadata, path);
    assertSameEntry(expected, metadata, path);
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        assertSameEntry(expected, await handle.stat(), path);
    } finally {
        await handle.close();
    }
}

function assertRealDirectory(metadata: Pick<Stats, "isDirectory" | "isSymbolicLink">, path: string): void {
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Integration registry directory must not be a symlink: ${path}`);
    }
}

function assertSameEntry(
    expected: FsRegistryDirectoryIdentity,
    actual: FsRegistryDirectoryIdentity,
    path: string,
): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error(`Integration registry directory changed during a privileged operation: ${path}`);
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
