import { S3Client } from "bun";
import type { BlobInput, CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";

/**
 * S3-compatible `CmsFilesBlobStore` (AWS S3 / OVH Object Storage / Cloudflare R2
 * / MinIO / …) backed by Bun's native `S3Client` — no aws-sdk. The provider is
 * picked entirely by config (endpoint/region/keys/bucket); the code is the same
 * for all of them.
 *
 * The blob `key` is the file's opaque id (no slashes, no traversal). `prefix`
 * isolates a tenant inside a shared bucket (e.g. `tenant_<id>/`) — same role as
 * the metadata store's `collectionPrefix`.
 */
export type S3CmsFilesBlobConfig = {
    bucket:          string;
    accessKeyId:     string;
    secretAccessKey: string;
    /** AWS region (e.g. `eu-west-3`) or the provider's region token (`gra`, `auto`). */
    region?:         string;
    /** Endpoint for non-AWS providers (OVH `s3.gra.io.cloud.ovh.net`, R2, MinIO…). Omit for AWS. */
    endpoint?:       string;
    /** Some providers (MinIO, path-style buckets) need path-style addressing. */
    virtualHostedStyle?: boolean;
    /** Key prefix prepended to every object — per-tenant isolation in a shared bucket. */
    prefix?:         string;
};

export class S3CmsFilesBlob implements CmsFilesBlobStore {

    private readonly _client: S3Client;
    private readonly _prefix: string;

    constructor(config: S3CmsFilesBlobConfig) {
        const { prefix, ...s3 } = config;
        this._client = new S3Client(s3);
        this._prefix = prefix ?? "";
    }

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        const size = await this._client.write(this._key(key), new Response(data as BodyInit));
        return { size };
    }

    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
        const file = this._client.file(this._key(key));
        return (await file.exists()) ? file.stream() : null;
    }

    async delete(key: string): Promise<void> {
        await this._client.file(this._key(key)).delete(); // S3 delete is idempotent
    }

    async exists(key: string): Promise<boolean> {
        return this._client.file(this._key(key)).exists();
    }

    private _key(key: string): string {
        if (!key || key.includes("..")) throw new Error(`invalid blob key "${key}"`);
        return this._prefix + key;
    }
}
