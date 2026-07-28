import { constants, type Stats } from "node:fs";
import { lstat, open, opendir, rmdir, unlink } from "node:fs/promises";
import { assertOwnedDirectory, syncDirectory, type OwnedStagingEntry, type StagingDirectory } from "./paths";

export async function removeOwnedStaging(staging: StagingDirectory): Promise<void> {
    const metadata = await lstat(staging.root.path).catch((error: unknown) => {
        if (errorCode(error) === "ENOENT") {
            return undefined;
        }
        throw error;
    });
    if (!metadata) {
        return;
    }
    assertSameEntry(staging.root.metadata, metadata);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error("Refusing to remove a replaced integration package staging directory");
    }
    await assertExactInventory(staging);
    const entries = [...staging.entries.entries()].sort(deepestFirst);
    for (const [, entry] of entries) {
        await makeOwnerWritable(entry);
    }
    await assertExactInventory(staging);
    for (const [, entry] of entries) {
        await removeExactEntry(entry);
    }
    await assertOwnedDirectory(staging.parent, "staging parent");
    await syncDirectory(staging.parent.path);
}

async function assertExactInventory(staging: StagingDirectory): Promise<void> {
    const observed = new Set<string>();
    await inspectEntry(staging, "", observed);
    if (observed.size !== staging.entries.size) {
        throw new Error("Refusing to remove an incomplete integration package staging inventory");
    }
}

async function inspectEntry(staging: StagingDirectory, relativePath: string, observed: Set<string>): Promise<void> {
    const expected = staging.entries.get(relativePath);
    if (!expected || observed.has(relativePath)) {
        throw new Error("Refusing to remove an unknown integration package staging entry");
    }
    const metadata = await lstat(expected.path);
    if (metadata.isSymbolicLink() || entryType(metadata) !== expected.type) {
        throw new Error("Refusing to remove a replaced integration package staging entry");
    }
    assertSameEntry(expected.metadata, metadata);
    observed.add(relativePath);
    if (expected.type === "file") {
        return;
    }
    const directory = await opendir(expected.path);
    const names: string[] = [];
    for await (const entry of directory) {
        names.push(entry.name);
    }
    names.sort(compareText);
    for (const name of names) {
        await inspectEntry(staging, relativePath ? `${relativePath}/${name}` : name, observed);
    }
}

async function makeOwnerWritable(entry: OwnedStagingEntry): Promise<void> {
    const flags =
        constants.O_RDONLY |
        constants.O_NOFOLLOW |
        (entry.type === "directory" ? constants.O_DIRECTORY : constants.O_NONBLOCK);
    const handle = await open(entry.path, flags);
    try {
        const current = await handle.stat();
        assertSameEntry(entry.metadata, current);
        if (entryType(current) !== entry.type) {
            throw new Error("Refusing to modify a replaced integration package staging entry");
        }
        await handle.chmod(entry.type === "directory" ? 0o700 : 0o600);
    } finally {
        await handle.close();
    }
}

async function removeExactEntry(entry: OwnedStagingEntry): Promise<void> {
    const metadata = await lstat(entry.path);
    assertSameEntry(entry.metadata, metadata);
    if (metadata.isSymbolicLink() || entryType(metadata) !== entry.type) {
        throw new Error("Refusing to remove a replaced integration package staging entry");
    }
    await (entry.type === "directory" ? rmdir(entry.path) : unlink(entry.path));
}

function assertSameEntry(expected: Pick<Stats, "dev" | "ino">, actual: Stats): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error("Refusing to remove a replaced integration package staging directory");
    }
}

function errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}

function entryType(metadata: Stats): OwnedStagingEntry["type"] | undefined {
    return metadata.isDirectory() ? "directory" : metadata.isFile() ? "file" : undefined;
}

function deepestFirst(left: [string, unknown], right: [string, unknown]): number {
    const depthDifference = pathDepth(right[0]) - pathDepth(left[0]);
    return depthDifference || compareText(right[0], left[0]);
}

function pathDepth(path: string): number {
    return path ? path.split("/").length : 0;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
