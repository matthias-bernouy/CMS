import { resourceMetadata } from "../../core/validation/lifecycle/metadata";
import type { CollectionResourceDeprecation } from "../../interfaces/CollectionRelease";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { sha256Digest } from "@bernouy/binary-media";
import { parseInlineSvgAsset } from "@bernouy/cms-content/page-document";
import { scanFileSourceTree } from "cms-repository/repository/authoring/sourceTree";

const ASSET_DEFINITION = "definition.json";
const MEDIA_TYPES = new Map([
    [".avif", "image/avif"],
    [".bmp", "image/bmp"],
    [".gif", "image/gif"],
    [".ico", "image/x-icon"],
    [".jpeg", "image/jpeg"],
    [".jpg", "image/jpeg"],
    [".json", "application/json"],
    [".mp3", "audio/mpeg"],
    [".mp4", "video/mp4"],
    [".ogg", "audio/ogg"],
    [".otf", "font/otf"],
    [".pdf", "application/pdf"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain"],
    [".ttf", "font/ttf"],
    [".wav", "audio/wav"],
    [".webm", "video/webm"],
    [".webp", "image/webp"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".zip", "application/zip"],
]);

type AssetDefinitionSource = Readonly<{ deprecations?: Readonly<Record<string, CollectionResourceDeprecation>> }>;

export async function loadCollectionAssets(directory: string) {
    const deprecations = await loadDeprecations(directory);
    const definitions = [];
    const bundle: { id: string; bytes: Uint8Array }[] = [];
    const seenFolded = new Set<string>();
    for (const file of await scanFileSourceTree(directory)) {
        if (file.relativePath === ASSET_DEFINITION) {
            continue;
        }
        const id = assetPath(file.relativePath);
        const folded = id.toLocaleLowerCase("en-US");
        if (seenFolded.has(folded)) {
            throw new Error(`Collection asset path collides by case: ${id}`);
        }
        seenFolded.add(folded);
        const mediaType = mediaTypeFor(id);
        const bytes = await readFile(file.absolutePath);
        const profiles = mediaType === "image/svg+xml" && isInlineSvg(bytes) ? ["inline-svg" as const] : [];
        bundle.push({ id, bytes });
        definitions.push({
            id,
            ...(deprecations.has(id) ? { deprecation: deprecations.get(id)! } : {}),
            mediaType,
            byteLength: bytes.byteLength,
            digest: await sha256Digest(bytes),
            ...(profiles.length ? { profiles } : {}),
        });
    }
    const unknown = [...deprecations.keys()].filter((id) => !seenFolded.has(id.toLocaleLowerCase("en-US")));
    if (unknown.length) {
        throw new Error(`Collection asset deprecations reference missing files: ${unknown.join(", ")}`);
    }
    return { definitions, bundle };
}

function isInlineSvg(bytes: Uint8Array): boolean {
    try {
        parseInlineSvgAsset(bytes);
        return true;
    } catch {
        return false;
    }
}

function assetPath(value: string): string {
    if (value.length === 0 || value.length > 512 || value.includes("\\") || value.startsWith("/")) {
        throw new Error(`Invalid collection asset path: ${value}`);
    }
    const segments = value.split("/");
    if (segments.some((segment) => !/^[a-z0-9][a-z0-9._-]*$/u.test(segment) || segment === "." || segment === "..")) {
        throw new Error(`Collection asset paths must use lowercase safe segments: ${value}`);
    }
    return value;
}

function mediaTypeFor(id: string): string {
    const mediaType = MEDIA_TYPES.get(extname(id));
    if (!mediaType) {
        throw new Error(`Unsupported collection asset extension: ${id}`);
    }
    return mediaType;
}

async function loadDeprecations(directory: string): Promise<Map<string, CollectionResourceDeprecation>> {
    const file = Bun.file(join(directory, ASSET_DEFINITION));
    if (!(await file.exists())) {
        return new Map();
    }
    const source = (await file.json()) as AssetDefinitionSource;
    if (
        !source ||
        typeof source !== "object" ||
        Array.isArray(source) ||
        Object.keys(source).some((key) => key !== "deprecations")
    ) {
        throw new Error("Asset definition accepts only a deprecations object");
    }
    if (source.deprecations === undefined) {
        return new Map();
    }
    if (!source.deprecations || typeof source.deprecations !== "object" || Array.isArray(source.deprecations)) {
        throw new Error("Asset deprecations must be an object");
    }
    return new Map(
        Object.entries(source.deprecations).map(([path, deprecation]) => {
            const id = assetPath(path);
            return [id, resourceMetadata({ deprecation }, `assets.${id}`).deprecation!];
        }),
    );
}
