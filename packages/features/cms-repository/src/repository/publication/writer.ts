import { createHash } from "node:crypto";
import { signRepositoryContentDigest, signRepositoryRequest } from "./auth";
import { encodePublicationUpload, type PublicationUploadManifest } from "./protocol";
import type { PublicationAsset, PublicationEnvelope, PublicationUploadReceipt, RemoteCoordinate } from "./types";

export class RemoteRepositoryWriter {
    constructor(
        private readonly base: URL,
        private readonly token?: string,
    ) {}

    async push(envelope: PublicationEnvelope): Promise<{ added: boolean; digest: string }> {
        const assets = envelope.assets.map(snapshotAsset);
        const manifest: PublicationUploadManifest = {
            kind: envelope.kind,
            canonicalJson: envelope.canonicalJson,
            assets: await Promise.all(assets.map(describeAsset)),
        };
        const created = await this.mutateBytes("POST", "v1/publication-uploads", encodePublicationUpload(manifest));
        if (!uploadReceipt(created)) {
            throw new Error("Repository returned an invalid publication upload receipt");
        }
        try {
            for (const asset of assets) {
                await this.uploadAsset(created.uploadId, asset, manifest.assets.find((item) => item.id === asset.id)!);
            }
            const value = await this.mutateBytes(
                "POST",
                `v1/publication-uploads/${created.uploadId}`,
                new Uint8Array(),
            );
            if (!plainRecord(value) || typeof value.added !== "boolean" || !digest(value.digest)) {
                throw new Error("Repository returned an invalid publication result");
            }
            return { added: value.added, digest: value.digest };
        } catch (error) {
            await this.abortUpload(created.uploadId);
            throw error;
        }
    }

    async yank(coordinate: RemoteCoordinate, reason: string | null): Promise<void> {
        const body = Buffer.from(JSON.stringify({ reason }));
        await this.mutateBytes(
            "PUT",
            `v1/yanks/${coordinate.kind}/${encodeURIComponent(coordinate.publisherId)}/${encodeURIComponent(coordinate.id)}/${encodeURIComponent(coordinate.version)}`,
            body,
        );
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

    private async abortUpload(uploadId: string): Promise<void> {
        await this.mutateBytes("DELETE", `v1/publication-uploads/${uploadId}`, new Uint8Array()).catch(() => undefined);
    }

    private async mutateBytes(method: string, path: string, body: Uint8Array): Promise<unknown> {
        const signed = signRepositoryRequest(method, new URL(path, this.base), body, this.requiredToken());
        return this.mutateBody(method, path, Buffer.from(body), signed.contentDigest, "application/json", signed);
    }

    private async mutateBody(
        method: string,
        path: string,
        body: BodyInit,
        contentDigest: string,
        contentType: string,
        suppliedSignature?: ReturnType<typeof signRepositoryRequest>,
    ): Promise<unknown> {
        const token = this.requiredToken();
        const url = new URL(path, this.base);
        const signed = suppliedSignature ?? signRepositoryContentDigest(method, url, contentDigest, token);
        const response = await fetch(url, {
            method,
            body,
            redirect: "error",
            signal: AbortSignal.timeout(120_000),
            headers: {
                Accept: "application/json",
                Authorization: signed.authorization,
                "Content-Type": contentType,
                "X-Ulvia-Timestamp": signed.timestamp,
                "X-Ulvia-Nonce": signed.nonce,
                "X-Ulvia-Content-SHA256": signed.contentDigest,
                "X-Ulvia-Signature": signed.signature,
            },
        });
        const value = response.status === 204 ? null : ((await response.json().catch(() => null)) as unknown);
        if (!response.ok) {
            throw new Error(remoteError(value, response.status));
        }
        return value;
    }

    private requiredToken(): string {
        if (!this.token) {
            throw new Error("ULVIA_REPOSITORY_TOKEN is required for repository mutations");
        }
        return this.token;
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
        Number.isFinite(Date.parse(value.expiresAt))
    );
}

function digest(value: unknown): value is string {
    return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
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
