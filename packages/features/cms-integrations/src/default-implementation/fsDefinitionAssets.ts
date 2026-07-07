import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IntegrationAsset } from "../interfaces/IntegrationDefinitionRepository";

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

    try {
        return {
            bytes: await readFile(safeJoin(versionRoot, path)),
            contentType,
        };
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") return null;
        throw error;
    }
}

function safeJoin(root: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(join(base, ...parts));
    const rel = relative(base, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`Path escapes integration asset root: ${parts.join("/")}`);
    }
    return target;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
