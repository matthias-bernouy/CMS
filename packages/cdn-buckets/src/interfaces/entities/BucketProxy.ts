/**
 * Proxy rule attached to a bucket. cdn-edge consumes the generated
 * fragment to expose `/.cms/data/<providerId>/*` on every host bound to
 * the bucket, forwarding to `server` with `auth` applied.
 *
 * The public type uses plaintext for `auth.token` / header values — the
 * Mongo persistence layer encrypts them transparently via the bucket's
 * DEK. Composite primary key: `(bucketId, providerId)`.
 */
export type ProxyAuth =
    | { type: 'none' }
    | { type: 'bearer';  token: string }
    | { type: 'headers'; headers: { name: string; value: string }[] };

export type BucketProxy = {
    bucketId:   string;
    providerId: string;
    server:     string;
    auth:       ProxyAuth;
    createdAt:  Date;
    updatedAt:  Date;
};
