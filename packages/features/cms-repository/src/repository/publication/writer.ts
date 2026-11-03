import { createHash } from "node:crypto";
import { isSha256Digest } from "@bernouy/binary-media";
import { encodePublicationUpload, type PublicationUploadManifest } from "./protocol";
import type { PublicationAsset, PublicationEnvelope, PublicationUploadReceipt, RemoteCoordinate } from "./types";
import { concurrentlyMap } from "./transport/concurrency";
import { RepositoryConnection } from "./transport/connection";
import type { RepositoryNamespaceCredential } from "./transport/credentials";
import { manifestPublisher } from "./ownership";

const TRANSFER_CONCURRENCY = 4;

export class RemoteRepositoryWriter {
    private readonly connection: RepositoryConnection;
    constructor(
        base: URL,
        private readonly credential?: RepositoryNamespaceCredential,
    ) {
        this.connection = new RepositoryConnection(base.origin, credential, {
            allowInsecureHttp: base.protocol === "http:",
        });
    }
    async push(envelope: PublicationEnvelope): Promise<{ added: boolean; digest: string }> {
        const owner = this.owner();
        if (manifestPublisher(envelope) !== owner.namespace) {
            throw new Error("Publication is outside the configured namespace");
        }
        const assets = envelope.assets.map(snapshotAsset);
        const manifest: PublicationUploadManifest = {
            kind: envelope.kind,
            canonicalJson: envelope.canonicalJson,
            assets: await concurrentlyMap(assets, TRANSFER_CONCURRENCY, describeAsset),
        };
        const created = await this.connection.readJson(
            await this.connection.request(
                "v1/uploads",
                {
                    method: "POST",
                    body: new Blob([new Uint8Array(encodePublicationUpload(manifest))]),
                    headers: {
                        "content-type": "application/octet-stream",
                        "x-repository-namespace": encodeURIComponent(owner.namespace),
                        "x-repository-namespace-revision": String(owner.namespaceRevision),
                    },
                },
                true,
            ),
        );
        if (!uploadReceipt(created)) {
            throw new Error("Repository returned an invalid publication upload receipt");
        }
        const uploaded = new Set(created.uploadedAssetIds);
        await concurrentlyMap(
            assets.filter((asset) => !uploaded.has(asset.id)),
            TRANSFER_CONCURRENCY,
            async (asset) => {
                const description = manifest.assets.find((entry) => entry.id === asset.id)!;
                const response = await this.connection.request(
                    `v1/uploads/${created.uploadId}/assets/${encodeURIComponent(asset.id)}`,
                    {
                        method: "PUT",
                        body: asset.bytes,
                        headers: {
                            "content-type": "application/octet-stream",
                            "x-repository-namespace": encodeURIComponent(owner.namespace),
                            "x-repository-namespace-revision": String(owner.namespaceRevision),
                            "x-repository-content-digest": encodeURIComponent(description.digest),
                        },
                    },
                    true,
                );
                await response.body?.cancel();
                if (!response.ok) {
                    throw new Error(`Repository asset upload failed (${response.status})`);
                }
            },
        );
        const result = await this.connection.json(
            "v1/uploads/commit",
            "POST",
            { ...owner, uploadId: created.uploadId },
            true,
        );
        if (!plainRecord(result) || typeof result.added !== "boolean" || !isSha256Digest(result.digest)) {
            throw new Error("Repository returned an invalid publication result");
        }
        return { added: result.added, digest: result.digest };
    }
    async yank(coordinate: RemoteCoordinate, reason: string | null): Promise<void> {
        const owner = this.owner();
        if (coordinate.publisherId !== owner.namespace) {
            throw new Error("Publication is outside the configured namespace");
        }
        const state = (await this.connection.json("v1/publications/state", "QUERY", coordinate)) as {
            revision?: unknown;
        };
        if (!Number.isSafeInteger(state.revision) || Number(state.revision) < 0) {
            throw new Error("Publication metadata revision is unavailable");
        }
        await this.connection.json(
            "v1/publications/yank",
            "POST",
            {
                ...coordinate,
                namespaceRevision: owner.namespaceRevision,
                expectedRevision: state.revision,
                reason,
            },
            true,
        );
    }
    private owner() {
        if (!this.credential) {
            throw new Error("Repository publication requires an authenticated namespace credential");
        }
        return { namespace: this.credential.namespace, namespaceRevision: this.credential.revision };
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

function plainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
