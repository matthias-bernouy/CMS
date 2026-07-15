import { readFile } from "node:fs/promises";
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

export async function readIntegrationAsset(versionRoot: string, path: string): Promise<IntegrationAsset | null> {
    if (!path.startsWith("assets/")) return null;
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
    if (!contentType) return null;
    const relativePath = path.slice("assets/".length);

    try {
        const assetRoot = await resolveExistingPathWithin(versionRoot, "asset", "assets");
        return {
            bytes: await readFile(await resolveExistingPathWithin(assetRoot, "asset", relativePath)),
            contentType,
        };
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") return null;
        throw error;
    }
}
