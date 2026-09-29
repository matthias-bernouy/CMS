import type { VerifiedCollectionAsset } from "./CollectionAssets";
import type { CollectionRelease } from "./CollectionRelease";

declare const collectionDigestBrand: unique symbol;
export type CollectionDigest = `sha256:${string}` & { readonly [collectionDigestBrand]: true };

/** Verified authored bundle, not a compiled/sandboxed renderer or an executable view grant. */
export interface AdmittedCollectionRelease {
    readonly kind: "admitted-collection-release";
    readonly release: CollectionRelease;
    readonly digest: CollectionDigest;
    readonly canonicalJson: string;
    readonly assets: readonly VerifiedCollectionAsset[];
}
