import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

export type OwnedDirectory = {
    path: string;
    metadata: Pick<Stats, "dev" | "ino">;
};

export type OwnedStagingEntry = OwnedDirectory & {
    type: "directory" | "file";
};

export type StagingDirectory = {
    parent: OwnedDirectory;
    root: OwnedDirectory;
    entries: Map<string, OwnedStagingEntry>;
};

export async function createStagingDirectory(destination: string): Promise<StagingDirectory> {
    if (!isAbsolute(destination) || normalize(destination) !== destination) {
        throw new TypeError("Integration package staging destination must be a normalized absolute path");
    }
    const requestedParent = dirname(destination);
    const name = basename(destination);
    if (!name || destination === requestedParent) {
        throw new TypeError("Integration package staging destination must name a child directory");
    }
    const parent = await requireCanonicalDirectory(requestedParent, "staging parent");
    if (parent.path !== requestedParent) {
        throw new Error("Integration package staging parent must not contain symlinks");
    }
    const canonicalDestination = join(parent.path, name);
    await assertMissing(canonicalDestination);
    await assertOwnedDirectory(parent, "staging parent");
    await mkdir(canonicalDestination, { mode: 0o750 });
    const createdMetadata = await lstat(canonicalDestination);
    const created: StagingDirectory = {
        parent,
        root: { path: canonicalDestination, metadata: createdMetadata },
        entries: new Map([["", { path: canonicalDestination, metadata: createdMetadata, type: "directory" as const }]]),
    };
    try {
        const root = await requireCanonicalDirectory(canonicalDestination, "staging destination");
        assertSameEntry(createdMetadata, root.metadata, "staging destination");
        assertDirectChild(parent.path, root.path);
        await assertOwnedDirectory(parent, "staging parent");
        await syncDirectory(parent.path);
        return { ...created, root };
    } catch (error) {
        throw new OwnedStagingCreationError(error, created);
    }
}

export class OwnedStagingCreationError extends Error {
    constructor(
        cause: unknown,
        readonly staging: StagingDirectory,
    ) {
        super("Integration package staging directory could not be verified after creation", { cause });
        this.name = "OwnedStagingCreationError";
    }
}

export async function createOwnedChildDirectory(
    staging: StagingDirectory,
    parent: OwnedDirectory,
    relativePath: string,
): Promise<OwnedDirectory> {
    await assertOwnedDirectory(parent, "package directory");
    const name = relativePath.split("/").at(-1)!;
    const path = join(parent.path, name);
    assertDirectChild(parent.path, path);
    await mkdir(path, { mode: 0o750 });
    const createdMetadata = await lstat(path);
    staging.entries.set(relativePath, { path, metadata: createdMetadata, type: "directory" });
    const child = await requireCanonicalDirectory(path, "package directory");
    assertSameEntry(createdMetadata, child.metadata, "package directory");
    assertDirectChild(parent.path, child.path);
    await assertOwnedDirectory(parent, "package directory");
    return child;
}

export async function assertOwnedDirectory(directory: OwnedDirectory, source: string): Promise<void> {
    const pathMetadata = await lstat(directory.path);
    if (pathMetadata.isSymbolicLink() || !pathMetadata.isDirectory()) {
        throw new Error(`Integration ${source} must remain a real directory`);
    }
    assertSameEntry(directory.metadata, pathMetadata, source);
    const canonical = await realpath(directory.path);
    if (canonical !== directory.path) {
        throw new Error(`Integration ${source} changed confinement while being verified`);
    }
    assertSameEntry(directory.metadata, await lstat(canonical), source);
}

export async function syncDirectory(path: string): Promise<void> {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function assertDirectChild(parent: string, child: string): void {
    const relation = relative(parent, child);
    if (!relation || relation.includes(sep) || relation === ".." || isAbsolute(relation)) {
        throw new Error("Integration package staging path changed confinement");
    }
}

async function requireCanonicalDirectory(path: string, source: string): Promise<OwnedDirectory> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Integration package ${source} must be a real non-symlink directory`);
    }
    const canonical = await realpath(path);
    assertSameEntry(metadata, await lstat(canonical), source);
    return { path: canonical, metadata };
}

async function assertMissing(path: string): Promise<void> {
    try {
        await lstat(path);
    } catch (error) {
        if (errorCode(error) === "ENOENT") {
            return;
        }
        throw error;
    }
    throw new Error("Integration package staging destination must not already exist");
}

function assertSameEntry(
    expected: Pick<Stats, "dev" | "ino">,
    actual: Pick<Stats, "dev" | "ino">,
    source: string,
): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error(`Integration package ${source} changed while being verified`);
    }
}

function errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}
