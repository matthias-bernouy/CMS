/**
 * Single-use upload authorization. Persistence is required to enforce that:
 * `consumedAt` is set on the first successful upload, then subsequent attempts
 * with the same `id` are rejected.
 */
export type PreSignedToken = {
    id: string;
    bucketId: string;
    parentFolderID: string | null;
    name: string;
    maxSize: number;
    contentType?: string;
    /** Optional URL-safe slug applied to the uploaded file (mirrored on the
     *  blob layer). Pre-signed at mint time so the broker — not the browser
     *  — controls the public layout. */
    publicPath?: string;
    expiresAt: Date;
    createdAt: Date;
    consumedAt?: Date;
    /** Snapshot of `bucket.allowedUploadOrigins` at mint time. The `/upload`
     *  endpoint compares the request's `Origin` header against this list so
     *  changing the bucket's origins later doesn't retro-authorize tokens
     *  already minted. Empty / missing = no cross-origin uploads. */
    allowedOrigins?: string[];
};
