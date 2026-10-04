import { createHash } from "node:crypto";
import { chmod, lstat, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { withRepositoryWriteLock } from "./lock";
import { syncDirectory } from "./durable";

const CONTENT_HASH = /^[0-9a-f]{64}$/u;

/** Remove only hash-addressed binary directories that no immutable release references. */
export async function recoverRepositoryStorage(root: string): Promise<void> {
    await withRepositoryWriteLock(root, async () => {
        await pruneAssetRoot(join(root, "assets", "collections"), await referencedHashes(join(root, "releases")));
        await pruneAssetRoot(join(root, "assets", "contracts"), await referencedHashes(join(root, "contracts")));
    });
}

export async function pruneRepository(root: string): Promise<void> {
    await withRepositoryWriteLock(root, async () => {
        const metadata = await lstat(root);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error("Local repository root must be a real directory");
        }
        for (const name of await readdir(root)) {
            if (name === ".write-lock") {
                continue;
            }
            const path = join(root, name);
            await makeDirectoryTreeRemovable(path);
            await rm(path, { recursive: true, force: true });
        }
    });
}

async function referencedHashes(metadataRoot: string): Promise<Set<string>> {
    const hashes = new Set<string>();
    for (const path of await jsonFiles(metadataRoot)) {
        hashes.add(
            createHash("sha256")
                .update(await readFile(path))
                .digest("hex"),
        );
    }
    return hashes;
}

async function jsonFiles(root: string): Promise<string[]> {
    const paths: string[] = [];
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            paths.push(...(await jsonFiles(path)));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            paths.push(path);
        }
    }
    return paths;
}

async function pruneAssetRoot(root: string, referenced: ReadonlySet<string>): Promise<void> {
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    let changed = false;
    for (const entry of entries) {
        if (!entry.isDirectory() || !CONTENT_HASH.test(entry.name) || referenced.has(entry.name)) {
            continue;
        }
        await rm(join(root, entry.name), { recursive: true, force: true });
        changed = true;
    }
    if (changed) {
        await syncDirectory(root);
    }
}

async function makeDirectoryTreeRemovable(path: string): Promise<void> {
    const entry = await lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
        return;
    }
    await chmod(path, entry.mode | 0o700);
    for (const name of await readdir(path)) {
        await makeDirectoryTreeRemovable(join(path, name));
    }
}
