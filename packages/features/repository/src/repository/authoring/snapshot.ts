import { SourcePathIndex } from "./preparations/source/paths";
import { AUTHORING_SOURCE_LIMITS } from "./preparations/source/limits";
import { parseStrictJson, canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { RepositoryArtifactKind } from "../publication/types";

export const COLLECTION_SOURCE_DIRECTORIES: readonly string[] = Object.freeze([
    "blocs",
    "translations",
    "assets",
    "texts",
    "theme",
    "examples",
]);

export interface SourceAsset {
    readonly path: string;
    readonly fileId?: string;
    readonly generation?: string;
    readonly publisherId?: string;
    readonly collectionId?: string;
    readonly contractId?: string;
    readonly version?: string;
    readonly releaseDigest?: string;
    readonly assetId?: string;
}
export interface AuthoringSourceSnapshot {
    readonly files: readonly { readonly path: string; readonly content: string }[];
    readonly assets: readonly SourceAsset[];
}

export function parseSourceSnapshot(
    json: string,
    kind: RepositoryArtifactKind = "collection",
): AuthoringSourceSnapshot {
    const value = parseStrictJson(
        json,
        AUTHORING_SOURCE_LIMITS.snapshotBytes,
        AUTHORING_SOURCE_LIMITS.jsonDepth,
    ) as unknown as AuthoringSourceSnapshot;
    if (
        !value ||
        !Array.isArray(value.files) ||
        value.files.length < 1 ||
        value.files.length > AUTHORING_SOURCE_LIMITS.files ||
        (value.assets !== undefined &&
            (!Array.isArray(value.assets) || value.assets.length > AUTHORING_SOURCE_LIMITS.assets)) ||
        Object.keys(value).some((key) => !["files", "assets"].includes(key))
    ) {
        throw new Error("Invalid authoring source snapshot");
    }
    if (value.files.length + (value.assets?.length ?? 0) > AUTHORING_SOURCE_LIMITS.files) {
        throw new Error("Authoring source snapshot contains too many files");
    }
    const paths = new SourcePathIndex();
    for (const file of value.files) {
        sourcePath(file.path, kind);
        if (
            typeof file.content !== "string" ||
            Buffer.byteLength(file.content, "utf8") > AUTHORING_SOURCE_LIMITS.fileBytes ||
            Object.keys(file).some((key) => !["path", "content"].includes(key))
        ) {
            throw new Error("Invalid authoring source file");
        }
        paths.add(file.path);
    }
    for (const asset of value.assets ?? []) {
        sourcePath(asset.path, kind);
        if (
            kind === "provider-manifest" ||
            !asset.path.startsWith(kind === "contract" ? "fixtures/" : "assets/") ||
            Object.keys(asset).some(
                (key) =>
                    ![
                        "path",
                        "fileId",
                        "generation",
                        "publisherId",
                        "collectionId",
                        "contractId",
                        "version",
                        "releaseDigest",
                        "assetId",
                    ].includes(key),
            )
        ) {
            throw new Error("Invalid source asset reference");
        }
        const file =
            typeof asset.fileId === "string" &&
            typeof asset.generation === "string" &&
            Object.keys(asset).every((key) => ["path", "fileId", "generation"].includes(key));
        const ownerKey = asset.contractId === undefined ? "collectionId" : "contractId";
        const release =
            [asset.publisherId, asset[ownerKey], asset.version, asset.releaseDigest, asset.assetId].every(
                (item) => typeof item === "string" && item.length > 0 && item.length <= 256,
            ) &&
            Object.keys(asset).every((key) =>
                ["path", "publisherId", ownerKey, "version", "releaseDigest", "assetId"].includes(key),
            );
        if (file === release || Object.values(asset).some((item) => typeof item !== "string" || item.length > 512)) {
            throw new Error("An asset needs one exact site file or Repository release reference");
        }
        paths.add(asset.path);
    }
    if (!paths.has("definition.json")) {
        throw new Error("Authoring source snapshot requires definition.json");
    }
    return {
        files: [...value.files].sort((a, b) => a.path.localeCompare(b.path)),
        assets: [...(value.assets ?? [])].sort((a, b) => a.path.localeCompare(b.path)),
    };
}

export function canonicalSourceSnapshot(snapshot: AuthoringSourceSnapshot) {
    return canonicalizeIJson(snapshot);
}

function sourcePath(path: string, kind: RepositoryArtifactKind) {
    const directories =
        kind === "collection"
            ? COLLECTION_SOURCE_DIRECTORIES
            : kind === "contract"
              ? ["capabilities", "mocks", "docs", "fixtures"]
              : [];
    if (
        typeof path !== "string" ||
        path.length > 256 ||
        path.split("/").length > 20 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/u.test(path) ||
        path.split("/").some((part) => !part || part.startsWith(".")) ||
        (path !== "definition.json" &&
            !(kind === "collection" && path === "bootstrap.json") &&
            !directories.includes(path.split("/")[0]!))
    ) {
        throw new Error("Invalid authoring source path");
    }
}
