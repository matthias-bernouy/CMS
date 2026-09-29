export interface CollectionAssetDefinition {
    readonly id: string;
    readonly mediaType: string;
    readonly byteLength: number;
    readonly digest: `sha256:${string}`;
}

export interface CollectionBundleAsset {
    readonly id: string;
    readonly bytes: Uint8Array | Blob;
}

export interface VerifiedCollectionAsset {
    readonly id: string;
    readonly bytes: Blob;
}
