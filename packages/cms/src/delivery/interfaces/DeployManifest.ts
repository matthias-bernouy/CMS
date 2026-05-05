/**
 * Snapshot of the last successful deployment, written to the html bucket as
 * `_manifest.json` (without `publicPath` — internal builder state, not
 * exposed to end users). The builder reads it at the start of each
 * `runOnce()` to skip work that hasn't changed and to know which assets are
 * already on the CDN.
 *
 * `repoStateHash` is the cheap short-circuit: when the current repo state
 * hashes to the same value, the builder bails before any rendering. The
 * per-page `htmlHash` is the post-enhancement hash, used to skip uploads
 * for pages whose final bytes are identical to the deployed version.
 *
 * `assetRefs` records the variant hashes a page depends on so a future GC
 * pass can compute orphans (`assetsBucket.list() − union(assetRefs) − sharedAssets`).
 */
export type DeployManifest = {
    version: 1;
    pages: Record<string /*path*/, DeployedPage>;
    sharedAssets: Record<string /*name*/, string /*hash*/>;
    repoStateHash: string;
    generatedAt: string;
};

export type DeployedPage = {
    /** sha256 of the final (post-enhancement) HTML bytes, hex. */
    htmlHash: string;
    /** Variant hashes referenced by this page's <img srcset>. */
    assetRefs: string[];
};

export const MANIFEST_FILENAME = "_manifest.json";
