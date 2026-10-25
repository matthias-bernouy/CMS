import { parseStrictJson, canonicalizeIJson } from "cms-repository/exports/contracts/protocol";

export interface SourceAsset {
    readonly path: string;
    readonly fileId?: string;
    readonly generation?: string;
    readonly publisherId?: string;
    readonly collectionId?: string;
    readonly version?: string;
    readonly releaseDigest?: string;
    readonly assetId?: string;
}
export interface CollectionSourceSnapshot {
    readonly files: readonly { readonly path: string; readonly content: string }[];
    readonly assets: readonly SourceAsset[];
}

export function parseSourceSnapshot(json: string): CollectionSourceSnapshot {
    const value = parseStrictJson(json, 1024 * 1024, 16) as unknown as CollectionSourceSnapshot;
    if (
        !value ||
        !Array.isArray(value.files) ||
        value.files.length < 1 ||
        value.files.length > 2048 ||
        (value.assets !== undefined && (!Array.isArray(value.assets) || value.assets.length > 64)) ||
        Object.keys(value).some((key) => !["files", "assets"].includes(key))
    ) {
        throw new Error("Invalid collection source snapshot");
    }
    const paths = new Set<string>();
    for (const file of value.files) {
        sourcePath(file.path);
        if (
            typeof file.content !== "string" ||
            file.content.length > 512 * 1024 ||
            Object.keys(file).some((key) => !["path", "content"].includes(key))
        ) {
            throw new Error("Invalid collection source file");
        }
        addPath(paths, file.path);
    }
    for (const asset of value.assets ?? []) {
        sourcePath(asset.path);
        if (
            !asset.path.startsWith("assets/") ||
            Object.keys(asset).some(
                (key) =>
                    ![
                        "path",
                        "fileId",
                        "generation",
                        "publisherId",
                        "collectionId",
                        "version",
                        "releaseDigest",
                        "assetId",
                    ].includes(key),
            )
        ) {
            throw new Error("Invalid source asset reference");
        }
        const file = typeof asset.fileId === "string" && typeof asset.generation === "string";
        const release = [
            asset.publisherId,
            asset.collectionId,
            asset.version,
            asset.releaseDigest,
            asset.assetId,
        ].every((item) => typeof item === "string" && item.length > 0 && item.length <= 256);
        if (file === release || Object.values(asset).some((item) => typeof item !== "string" || item.length > 512)) {
            throw new Error("An asset needs one exact site file or Repository release reference");
        }
        addPath(paths, asset.path);
    }
    if (!paths.has("definition.json")) {
        throw new Error("Collection source snapshot requires definition.json");
    }
    return {
        files: [...value.files].sort((a, b) => a.path.localeCompare(b.path)),
        assets: [...(value.assets ?? [])].sort((a, b) => a.path.localeCompare(b.path)),
    };
}

export function canonicalSourceSnapshot(snapshot: CollectionSourceSnapshot) {
    return canonicalizeIJson(snapshot);
}

function addPath(paths: Set<string>, path: string) {
    const normalized = path.toLowerCase();
    if (
        paths.has(normalized) ||
        [...paths].some((item) => item.startsWith(`${normalized}/`) || normalized.startsWith(`${item}/`))
    ) {
        throw new Error("Source paths overlap or are duplicated");
    }
    paths.add(normalized);
}
function sourcePath(path: string) {
    if (
        typeof path !== "string" ||
        path.length > 256 ||
        path.split("/").length > 20 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/u.test(path) ||
        path.split("/").some((part) => !part || part.startsWith(".")) ||
        (path !== "definition.json" &&
            !["blocs", "translations", "assets", "texts", "pages", "theme", "migrations"].includes(path.split("/")[0]!))
    ) {
        throw new Error("Invalid collection source path");
    }
}
