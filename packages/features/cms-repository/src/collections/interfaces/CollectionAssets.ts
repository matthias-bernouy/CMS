import type { CollectionResourceDeprecation } from "./CollectionRelease";
type CollectionAssetProfile = "inline-svg";

export interface CollectionAssetDefinition {
    readonly deprecation?: CollectionResourceDeprecation;
    readonly id: string;
    readonly mediaType: string;
    readonly byteLength: number;
    readonly digest: `sha256:${string}`;
    readonly profiles?: readonly CollectionAssetProfile[];
}

export interface CollectionBundleAsset {
    readonly id: string;
    readonly bytes: Uint8Array | Blob;
}

export interface VerifiedCollectionAsset {
    readonly id: string;
    readonly bytes: Blob;
}
