/**
 * Opaque byte storage for a tenant's files — the bytes half of the file system,
 * paired with `CmsFilesMetadataRepository` (the tree). Keyed by the file's `id`
 * (`id` IS the key): this layer knows nothing about folders, names or paths.
 *
 * Pluggable backend — in-memory, local FS, and an S3-compatible impl (AWS /
 * OVH / R2 / MinIO via Bun's native S3Client). Consumed only server-side: the
 * browser never touches it, it talks to the CMS which proxies through here.
 */

/** Raw bytes to store. The CMS receives these from the browser upload request
 *  (buffered or streamed) and hands them to the store. */
export type BlobInput = Blob | Uint8Array | ReadableStream<Uint8Array>;

export interface CmsFilesBlobStore {
    /** Store bytes under `key`, overwriting any existing blob. Returns the byte size. */
    put(key: string, data: BlobInput): Promise<{ size: number }>;
    /** Read a blob's bytes as a stream (to proxy back to the browser), or `null` if absent. */
    get(key: string): Promise<ReadableStream<Uint8Array> | null>;
    /** Remove a blob. Idempotent — no error when `key` is absent. */
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
}
