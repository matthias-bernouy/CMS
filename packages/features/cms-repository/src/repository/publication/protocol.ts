import { RepositoryRequestError } from "../core/errors";
import { isSha256Digest } from "@bernouy/binary-media";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { MAX_REPOSITORY_RESPONSE_BYTES } from "cms-repository/repository-http/getBytes";
import type { PublicationUploadManifest, RepositoryArtifactKind } from "./types";

export type { PublicationUploadManifest } from "./types";

export const MAX_PUBLICATION_METADATA_BYTES = 20 * 1024 * 1024;
export const MAX_PUBLICATION_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_PUBLICATION_BUNDLE_BYTES = 100 * 1024 * 1024;
const MAX_CANONICAL_JSON_BYTES = MAX_REPOSITORY_RESPONSE_BYTES;
const MAX_ASSETS = 1_024;

export function encodePublicationUpload(manifest: PublicationUploadManifest): Uint8Array {
    return Buffer.from(
        JSON.stringify({
            protocol: "ulvia-repository-upload/v1",
            ...manifest,
        }),
    );
}

export function parsePublicationUpload(bytes: Uint8Array): PublicationUploadManifest {
    const value = parseStrictJson(bytes, MAX_PUBLICATION_METADATA_BYTES, 8) as Record<string, unknown>;
    if (
        !plainRecord(value) ||
        Object.keys(value).some((key) => !["protocol", "kind", "canonicalJson", "assets"].includes(key)) ||
        value.protocol !== "ulvia-repository-upload/v1" ||
        !isKind(value.kind) ||
        typeof value.canonicalJson !== "string" ||
        !Array.isArray(value.assets) ||
        value.assets.length > MAX_ASSETS ||
        Buffer.byteLength(value.canonicalJson) > MAX_CANONICAL_JSON_BYTES
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid publication upload manifest");
    }
    const assets = value.assets.map(parseUploadAsset);
    if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
        throw new RepositoryRequestError("REJECTED", "Publication asset IDs must be unique");
    }
    const totalBytes = assets.reduce((total, asset) => total + asset.byteLength, 0);
    if (totalBytes > MAX_PUBLICATION_BUNDLE_BYTES || (value.kind === "provider-manifest" && assets.length)) {
        throw new RepositoryRequestError("REJECTED", "Publication asset bundle exceeds its limits");
    }
    return { kind: value.kind, canonicalJson: value.canonicalJson, assets };
}

export function parseYank(bytes: Uint8Array): string | null {
    const value = parseStrictJson(bytes, 2_048, 2) as Record<string, unknown>;
    if (!plainRecord(value) || Object.keys(value).some((key) => key !== "reason" && key !== "expectedRevision")) {
        throw new RepositoryRequestError("REJECTED", "Invalid yank request");
    }
    if (value.reason === null) {
        return null;
    }
    if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.trim().length > 1_024) {
        throw new RepositoryRequestError("REJECTED", "Invalid yank reason");
    }
    return value.reason.trim();
}

export function parseYankRevision(bytes: Uint8Array): number | undefined {
    const value = parseStrictJson(bytes, 2_048, 2) as Record<string, unknown>;
    if (value.expectedRevision === undefined) {
        return undefined;
    }
    if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0) {
        throw new RepositoryRequestError("REJECTED", "Invalid publication metadata revision");
    }
    return value.expectedRevision as number;
}

export async function readRepositoryMutationBody(
    request: Request,
    maximum = MAX_PUBLICATION_METADATA_BYTES,
): Promise<Uint8Array> {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximum) {
        throw new RepositoryRequestError("REJECTED", "Repository mutation body is too large");
    }
    if (!request.body) {
        return new Uint8Array();
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            length += part.value.byteLength;
            if (length > maximum) {
                await reader.cancel();
                throw new RepositoryRequestError("REJECTED", "Repository mutation body is too large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function parseUploadAsset(value: unknown) {
    if (
        !plainRecord(value) ||
        Object.keys(value).some((key) => !["id", "byteLength", "digest"].includes(key)) ||
        typeof value.id !== "string" ||
        !isPublicationAssetId(value.id) ||
        !Number.isSafeInteger(value.byteLength) ||
        (value.byteLength as number) < 0 ||
        (value.byteLength as number) > MAX_PUBLICATION_ASSET_BYTES ||
        !isSha256Digest(value.digest)
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid publication upload asset");
    }
    return {
        id: value.id,
        byteLength: value.byteLength as number,
        digest: value.digest,
    };
}

export function isPublicationAssetId(value: string): boolean {
    return (
        value.length > 0 &&
        value.length <= 512 &&
        !value.includes("\\") &&
        !value.startsWith("/") &&
        value.split("/").every((segment) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(segment))
    );
}

function isKind(value: unknown): value is RepositoryArtifactKind {
    return value === "collection" || value === "contract" || value === "provider-manifest";
}

function plainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
