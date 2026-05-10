import type { RulesConfig } from "../proxy/RulesConfig";

/**
 * Proxy rule attached to a bucket. cdn-edge consumes the generated
 * fragment to expose `/.cms/data/<providerId>/*` on every host bound to
 * the bucket, forwarding to `server` with the declarative `rules`
 * applied (see `core/proxy/rules/`).
 *
 * `secrets` carries the cleartext values referenced by `${env:NAME}`
 * interpolations inside `rules`. They are encrypted at rest via the
 * bucket DEK by `MongoBucketProxyRepository` — never persisted in
 * plaintext, never written to the rendered nginx fragment, and pushed
 * to edges through the `/edge-api/secrets` channel where they live in
 * tmpfs + nginx process env (read at runtime by `os.getenv`).
 *
 * Composite primary key: `(bucketId, providerId)`.
 */
export type BucketProxy = {
    bucketId:   string;
    providerId: string;
    server:     string;
    rules:      RulesConfig;
    /** envName → cleartext, supplied by the operator. Every `${env:NAME}`
     *  in `rules` MUST have a matching entry; `upsertProxy` rejects the
     *  write otherwise. Empty when `rules` references no env. */
    secrets:    Record<string, string>;
    createdAt:  Date;
    updatedAt:  Date;
};
