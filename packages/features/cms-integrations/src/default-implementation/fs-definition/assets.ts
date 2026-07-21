import { open, readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";
import { isNodeError, resolveExistingPathWithin } from "./repositorySupport";

const CONTENT_TYPES: Record<string, string> = {
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
};

export async function readIntegrationAsset(
    versionRoot: string,
    path: string,
    maxBytes?: number,
): Promise<IntegrationAsset | null> {
    if (!path.startsWith("assets/")) {
        return null;
    }
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
    if (!contentType) {
        return null;
    }
    const relativePath = path.slice("assets/".length);

    try {
        const assetRoot = await resolveExistingPathWithin(versionRoot, "asset", "assets");
        const assetPath = await resolveExistingPathWithin(assetRoot, "asset", relativePath);
        return {
            bytes:
                maxBytes === undefined ? await readFile(assetPath) : await readFileBounded(assetPath, path, maxBytes),
            contentType,
        };
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function readFileBounded(filePath: string, assetPath: string, maxBytes: number): Promise<Uint8Array> {
    const handle = await open(filePath, "r");
    try {
        const bytes = new Uint8Array(maxBytes + 1);
        let offset = 0;
        while (offset < bytes.length) {
            const result = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (result.bytesRead === 0) {
                break;
            }
            offset += result.bytesRead;
        }
        if (offset > maxBytes) {
            throw new Error(`Integration asset "${assetPath}" exceeds ${maxBytes} bytes`);
        }
        return bytes.subarray(0, offset);
    } finally {
        await handle.close();
    }
}
