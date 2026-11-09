import { AUTHORING_SOURCE_LIMITS } from "./limits";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { readSourceEntries, scanFileSourceTree } from "../../sourceTree";
import { COLLECTION_SOURCE_DIRECTORIES, canonicalSourceSnapshot, parseSourceSnapshot } from "../../snapshot";
import type { PublicationAsset } from "repository/repository/publication/types";

/** Capture before compiling so later edits cannot change a cached release's sources. */
export async function captureCollectionSources(directory: string) {
    const entries = await readSourceEntries(directory);
    const excluded = new Set<string>();
    for (const entry of entries) {
        if (entry.isDirectory() && !COLLECTION_SOURCE_DIRECTORIES.includes(entry.name)) {
            throw new Error(`Unknown collection source directory: ${entry.name}`);
        }
        if (entry.isFile() && !["definition.json", "bootstrap.json"].includes(entry.name)) {
            excluded.add(entry.name);
        }
    }
    const files: { path: string; content: string }[] = [];
    const assets: PublicationAsset[] = [];
    let assetBytes = 0;
    let textBytes = 0;
    for (const file of await scanFileSourceTree(directory, excluded)) {
        const binary = file.relativePath.startsWith("assets/") && file.relativePath !== "assets/definition.json";
        if (binary && assets.length >= AUTHORING_SOURCE_LIMITS.assets) {
            throw new Error(`Collection source snapshot exceeds its ${AUTHORING_SOURCE_LIMITS.assets}-asset limit`);
        }
        const maximum = binary ? AUTHORING_SOURCE_LIMITS.assetBytes : AUTHORING_SOURCE_LIMITS.fileBytes;
        const handle = await open(file.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes: Buffer;
        try {
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.size > maximum) {
                throw new Error("Collection source file exceeds its limit");
            }
            bytes = Buffer.alloc(maximum + 1);
            let offset = 0;
            while (offset < bytes.length) {
                const part = await handle.read(bytes, offset, bytes.length - offset, null);
                if (part.bytesRead === 0) {
                    break;
                }
                offset += part.bytesRead;
            }
            if (offset > maximum) {
                throw new Error("Collection source file exceeds its limit");
            }
            bytes = bytes.subarray(0, offset);
        } finally {
            await handle.close();
        }
        if (binary) {
            assetBytes += bytes.length;
            if (assetBytes > AUTHORING_SOURCE_LIMITS.assetBundleBytes) {
                throw new Error("Collection source asset bundle exceeds its limit");
            }
            assets.push({ id: file.relativePath.slice(7), bytes: new Blob([new Uint8Array(bytes)]) });
        } else {
            textBytes += bytes.length;
            if (textBytes > AUTHORING_SOURCE_LIMITS.snapshotBytes) {
                throw new Error("Collection source snapshot exceeds 8 MiB");
            }
            files.push({ path: file.relativePath, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
        }
    }
    const sourceJson = canonicalSourceSnapshot({
        files,
        assets: assets.map(({ id }) => ({ path: `assets/${id}`, fileId: "local", generation: "snapshot" })),
    });
    parseSourceSnapshot(sourceJson);
    return { sourceJson, assets };
}
