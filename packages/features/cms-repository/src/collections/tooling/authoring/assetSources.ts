import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { sha256Digest } from "@bernouy/binary-media";
import { parseInlineSvgAsset } from "@bernouy/cms-content/page-document";
import { scanFileSourceTree } from "./sourceTree";

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

type AssetDefinitionSource = Readonly<{ generations?: Readonly<Record<string, number>> }>;

export async function loadCollectionAssets(directory: string) {
    const generations = await loadGenerations(directory);
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
            generation: generations.get(id) ?? 1,
            mediaType,
            byteLength: bytes.byteLength,
            digest: await sha256Digest(bytes),
            ...(profiles.length ? { profiles } : {}),
        });
    }
    const unknown = [...generations.keys()].filter((id) => !seenFolded.has(id.toLocaleLowerCase("en-US")));
    if (unknown.length) {
        throw new Error(`Collection asset generations reference missing files: ${unknown.join(", ")}`);
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

async function loadGenerations(directory: string): Promise<Map<string, number>> {
    const file = Bun.file(join(directory, ASSET_DEFINITION));
    if (!(await file.exists())) {
        return new Map();
    }
    const source = (await file.json()) as AssetDefinitionSource;
    if (
        !source ||
        typeof source !== "object" ||
        Array.isArray(source) ||
        Object.keys(source).some((key) => key !== "generations")
    ) {
        throw new Error("Asset definition accepts only a generations object");
    }
    if (source.generations === undefined) {
        return new Map();
    }
    if (!source.generations || typeof source.generations !== "object" || Array.isArray(source.generations)) {
        throw new Error("Asset generations must be an object");
    }
    return new Map(
        Object.entries(source.generations).map(([path, generation]) => {
            const id = assetPath(path);
            if (!Number.isSafeInteger(generation) || generation < 1) {
                throw new Error(`Asset generation must be a positive integer: ${id}`);
            }
            return [id, generation];
        }),
    );
}
