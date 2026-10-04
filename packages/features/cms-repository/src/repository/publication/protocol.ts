import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { PublicationAsset, PublicationEnvelope, RepositoryArtifactKind } from "./types";

export type { PublicationAsset, PublicationEnvelope } from "./types";

// 100 MiB admitted binary bundles expand by 4/3 in canonical base64, plus JSON metadata.
export const MAX_PUBLICATION_BYTES = 160 * 1024 * 1024;

export function encodePublication(envelope: PublicationEnvelope): Uint8Array {
    return Buffer.from(
        JSON.stringify({
            protocol: "ulvia-repository-publication/v1",
            kind: envelope.kind,
            canonicalJson: envelope.canonicalJson,
            assets: envelope.assets.map((asset) => ({
                id: asset.id,
                base64: Buffer.from(asset.bytes).toString("base64"),
            })),
        }),
    );
}

export function parsePublication(bytes: Uint8Array): PublicationEnvelope {
    const value = parseStrictJson(bytes, MAX_PUBLICATION_BYTES, 8) as Record<string, unknown>;
    if (
        !plainRecord(value) ||
        Object.keys(value).some((key) => !["protocol", "kind", "canonicalJson", "assets"].includes(key)) ||
        value.protocol !== "ulvia-repository-publication/v1" ||
        !isKind(value.kind) ||
        typeof value.canonicalJson !== "string" ||
        !Array.isArray(value.assets) ||
        value.assets.length > 256
    ) {
        throw new Error("Invalid publication envelope");
    }
    const assets = value.assets.map((asset) => parseAsset(asset));
    if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
        throw new Error("Publication asset IDs must be unique");
    }
    return { kind: value.kind, canonicalJson: value.canonicalJson, assets };
}

export function parseYank(bytes: Uint8Array): string | null {
    const value = parseStrictJson(bytes, 2_048, 2) as Record<string, unknown>;
    if (!plainRecord(value) || Object.keys(value).some((key) => key !== "reason")) {
        throw new Error("Invalid yank request");
    }
    if (value.reason === null) {
        return null;
    }
    if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.trim().length > 1_024) {
        throw new Error("Invalid yank reason");
    }
    return value.reason.trim();
}

async function readBody(request: Request): Promise<Uint8Array> {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_PUBLICATION_BYTES) {
        throw new Error("Repository mutation body is too large");
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
            if (length > MAX_PUBLICATION_BYTES) {
                await reader.cancel();
                throw new Error("Repository mutation body is too large");
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

export { readBody as readRepositoryMutationBody };

function parseAsset(value: unknown): PublicationAsset {
    if (
        !plainRecord(value) ||
        Object.keys(value).some((key) => key !== "id" && key !== "base64") ||
        typeof value.id !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(value.id) ||
        typeof value.base64 !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.base64)
    ) {
        throw new Error("Invalid publication asset");
    }
    const bytes = Buffer.from(value.base64, "base64");
    if (bytes.toString("base64") !== value.base64) {
        throw new Error("Publication asset must use canonical base64");
    }
    return { id: value.id, bytes };
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
