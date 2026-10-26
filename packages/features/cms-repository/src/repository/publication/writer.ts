import { createHash } from "node:crypto";
import { isSha256Digest } from "@bernouy/binary-media";
import { repositoryWriteHeaders, type RepositoryOwnerCredential } from "../namespaces/request";
import { encodePublicationUpload, type PublicationUploadManifest } from "./protocol";
import type { PublicationAsset, PublicationEnvelope, PublicationUploadReceipt, RemoteCoordinate } from "./types";
import { concurrentlyMap } from "./transport/concurrency";
import { boundedResponseBytes } from "./transport";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";

const TRANSFER_CONCURRENCY = 4;

export class RemoteRepositoryWriter {
    constructor(
        private readonly base: URL,
        private readonly credential?: RepositoryOwnerCredential,
    ) {}

    async push(envelope: PublicationEnvelope): Promise<{ added: boolean; digest: string }> {
        const assets = envelope.assets.map(snapshotAsset);
        const manifest: PublicationUploadManifest = {
            kind: envelope.kind,
            canonicalJson: envelope.canonicalJson,
            assets: await concurrentlyMap(assets, TRANSFER_CONCURRENCY, describeAsset),
        };
        const created = await this.mutateBytes("POST", "v1/publication-uploads", encodePublicationUpload(manifest));
        if (!uploadReceipt(created)) {
            throw new Error("Repository returned an invalid publication upload receipt");
        }
        const uploaded = new Set(created.uploadedAssetIds);
        await concurrentlyMap(
            assets.filter((asset) => !uploaded.has(asset.id)),
            TRANSFER_CONCURRENCY,
            async (asset) => {
                await this.uploadAsset(created.uploadId, asset, manifest.assets.find((item) => item.id === asset.id)!);
            },
        );
        const value = await this.mutateBytes("POST", `v1/publication-uploads/${created.uploadId}`, new Uint8Array());
        if (!plainRecord(value) || typeof value.added !== "boolean" || !isSha256Digest(value.digest)) {
            throw new Error("Repository returned an invalid publication result");
        }
        return { added: value.added, digest: value.digest };
    }

    async yank(coordinate: RemoteCoordinate, reason: string | null): Promise<void> {
        const path = `v1/yanks/${coordinate.kind}/${encodeURIComponent(coordinate.publisherId)}/${encodeURIComponent(coordinate.id)}/${encodeURIComponent(coordinate.version)}`;
        let expectedRevision: number | undefined;
        if (this.credential) {
            const response = await fetch(new URL(path, this.base), {
                redirect: "error",
                signal: AbortSignal.timeout(15_000),
            });
            const state = parseStrictJson(await boundedResponseBytes(response, 4_096), 4_096, 4) as {
                revision?: unknown;
            };
            if (!response.ok || !Number.isSafeInteger(state.revision) || (state.revision as number) < 0) {
                throw new Error("Publication metadata revision is unavailable");
            }
            expectedRevision = state.revision as number;
        }
        const body = Buffer.from(
            JSON.stringify({ reason, ...(expectedRevision === undefined ? {} : { expectedRevision }) }),
        );
        await this.mutateBytes("PUT", path, body);
    }

    private async uploadAsset(
        uploadId: string,
        asset: PublicationAsset & { bytes: Blob },
        description: PublicationUploadManifest["assets"][number],
    ): Promise<void> {
        await this.mutateBody(
            "PUT",
            `v1/publication-uploads/${uploadId}/assets/${encodeURIComponent(asset.id)}`,
            asset.bytes,
            description.digest.slice("sha256:".length),
            "application/octet-stream",
        );
    }

    private async mutateBytes(method: string, path: string, body: Uint8Array): Promise<unknown> {
        return this.mutateBody(
            method,
            path,
            Buffer.from(body),
            createHash("sha256").update(body).digest("hex"),
            "application/json",
        );
    }

    private async mutateBody(
        method: string,
        path: string,
        body: BodyInit,
        contentDigest: string,
        contentType: string,
    ): Promise<unknown> {
        const url = new URL(path, this.base);
        const authentication = await repositoryWriteHeaders(method, url, contentDigest, this.credential);
        const response = await fetch(url, {
            method,
            body,
            redirect: "error",
            signal: AbortSignal.timeout(120_000),
            headers: {
                Accept: "application/json",
                "Content-Type": contentType,
                ...authentication,
            },
        });
        const value =
            response.status === 204
                ? null
                : parseStrictJson(await boundedResponseBytes(response, 16 * 1024 * 1024), 16 * 1024 * 1024, 64);
        if (!response.ok) {
            throw new Error(remoteError(value, response.status));
        }
        return value;
    }
}

function snapshotAsset(asset: PublicationAsset): PublicationAsset & { bytes: Blob } {
    const bytes = asset.bytes instanceof Blob ? asset.bytes : new Blob([asset.bytes.slice()]);
    return { id: asset.id, bytes };
}

async function describeAsset(asset: PublicationAsset & { bytes: Blob }) {
    const hash = createHash("sha256");
    const reader = asset.bytes.stream().getReader();
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            hash.update(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    return { id: asset.id, byteLength: asset.bytes.size, digest: `sha256:${hash.digest("hex")}` as const };
}

function uploadReceipt(value: unknown): value is PublicationUploadReceipt {
    return (
        plainRecord(value) &&
        typeof value.uploadId === "string" &&
        /^[0-9a-f-]{36}$/u.test(value.uploadId) &&
        typeof value.expiresAt === "string" &&
        Number.isFinite(Date.parse(value.expiresAt)) &&
        Array.isArray(value.uploadedAssetIds) &&
        value.uploadedAssetIds.every((id) => typeof id === "string") &&
        new Set(value.uploadedAssetIds).size === value.uploadedAssetIds.length
    );
}

function remoteError(value: unknown, status: number): string {
    if (plainRecord(value) && plainRecord(value.error) && typeof value.error.message === "string") {
        return `Repository rejected the request (${status}): ${value.error.message}`;
    }
    return `Repository rejected the request (${status})`;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
