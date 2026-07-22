import { readdir } from "node:fs/promises";
import { randomUUIDv7 } from "bun";
import { sha256Hex } from "cms-files/core/media/hashBytes";
import type { LocalFilesRegistry, ReconcileOptions, ReconcileResult, RegistryEntry } from "./LocalFilesRegistry";

export async function reconcileLocalFiles(
    registry: LocalFilesRegistry,
    options: ReconcileOptions = {},
): Promise<ReconcileResult> {
    if (options.force) {
        await registry.reset();
    } else {
        await registry.ensure();
    }
    const previous = registry.data!;
    const result: ReconcileResult = { healed: [], minted: [], deleted: [], errors: [] };
    const folders: string[] = [];
    const files: string[] = [];
    await scanDisk(registry, "", folders, files);
    folders.sort();
    files.sort();
    const fileSet = new Set(files);
    const byId: Record<string, RegistryEntry> = {};
    const byPath: Record<string, string> = {};

    for (const path of folders) {
        const existing = previous.byPath[path];
        const uuid = existing && previous.byId[existing]?.hash === null ? existing : randomUUIDv7();
        if (uuid !== existing) {
            result.minted.push({ uuid, path });
        }
        byId[uuid] = { path, hash: null };
        byPath[path] = uuid;
    }

    const diskHashes = await readDiskHashes(registry, files, result);
    const recovery = buildRecoveryIndex(previous.byId, fileSet);
    const consumed = new Set<string>();
    for (const path of files) {
        const hash = diskHashes.get(path);
        if (hash === undefined) {
            continue;
        }
        const known = previous.byPath[path];
        if (known && previous.byId[known]?.hash !== null) {
            byId[known] = { path, hash };
            byPath[path] = known;
            continue;
        }
        const candidate = (recovery.get(hash) ?? []).find((uuid) => !consumed.has(uuid));
        if (candidate) {
            consumed.add(candidate);
            result.healed.push({ uuid: candidate, from: previous.byId[candidate]!.path, to: path });
            byId[candidate] = { path, hash };
            byPath[path] = candidate;
        } else {
            const uuid = randomUUIDv7();
            result.minted.push({ uuid, path });
            byId[uuid] = { path, hash };
            byPath[path] = uuid;
        }
    }

    for (const [uuid, entry] of Object.entries(previous.byId)) {
        if (entry.hash !== null && !fileSet.has(entry.path) && !consumed.has(uuid)) {
            result.deleted.push({ uuid, path: entry.path });
        }
    }
    registry.data = { version: 1, byId, byPath };
    await registry.save();
    registry.dirty = false;
    return result;
}

async function scanDisk(
    registry: LocalFilesRegistry,
    relativePath: string,
    folders: string[],
    files: string[],
): Promise<void> {
    let entries;
    try {
        entries = await readdir(registry.abs(relativePath), { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".")) {
            continue;
        }
        const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            folders.push(childPath);
            await scanDisk(registry, childPath, folders, files);
        } else if (entry.isFile()) {
            files.push(childPath);
        }
    }
}

async function readDiskHashes(
    registry: LocalFilesRegistry,
    paths: string[],
    result: ReconcileResult,
): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    for (const path of paths) {
        try {
            hashes.set(path, sha256Hex(await Bun.file(registry.abs(path)).bytes()));
        } catch (error) {
            result.errors.push({ path, error: String(error) });
        }
    }
    return hashes;
}

function buildRecoveryIndex(entries: Record<string, RegistryEntry>, fileSet: Set<string>): Map<string, string[]> {
    const recovery = new Map<string, string[]>();
    for (const [uuid, entry] of Object.entries(entries).sort(([, left], [, right]) =>
        left.path.localeCompare(right.path),
    )) {
        if (entry.hash !== null && !fileSet.has(entry.path)) {
            (recovery.get(entry.hash) ?? recovery.set(entry.hash, []).get(entry.hash)!).push(uuid);
        }
    }
    return recovery;
}
