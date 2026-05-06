/**
 * Bytes-only abstraction, decoupled from metadata. Lets us swap local FS for
 * S3 / R2 / etc. without touching the repositories. SHA-256 is computed during
 * streaming so the file body is read once.
 */
export interface BlobStorage {

    /** Allocate per-bucket storage (e.g. mkdir on local FS, prefix on S3). */
    createBucket(bucketId: string): Promise<void>;

    /** Drop everything stored under this bucket. Irreversible. */
    deleteBucket(bucketId: string): Promise<void>;

    /**
     * Stream `body` to `(bucketId, key)`. Returns the byte count and SHA-256
     * computed on the fly. `key` is opaque to the caller — for the basic
     * implementation it's `<file-id>.<ext>`.
     */
    write(bucketId: string, key: string, body: ReadableStream<Uint8Array>): Promise<BlobWriteResult>;

    read(bucketId: string, key: string): Promise<ReadableStream<Uint8Array> | null>;

    delete(bucketId: string, key: string): Promise<void>;

    exists(bucketId: string, key: string): Promise<boolean>;

    /**
     * Make the blob `(bucketId, key)` reachable via the public-facing
     * `publicPath` (e.g. `"blog/post.html"`). On the local FS this is a
     * symlink; on object stores it can be a redirect rule. Idempotent on
     * the same target — replaces any existing alias at that path. Caller
     * is expected to have validated uniqueness in the metadata layer first.
     */
    setPublicPath(bucketId: string, publicPath: string, key: string): Promise<void>;

    /** Drop the alias at `publicPath`. No-op if it doesn't exist. */
    clearPublicPath(bucketId: string, publicPath: string): Promise<void>;
}

export type BlobWriteResult = {
    size: number;
    sha256: string;
};
