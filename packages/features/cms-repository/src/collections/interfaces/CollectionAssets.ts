export interface CollectionAssetDefinition {
    readonly id: string;
    /** Independent public-contract generation for selective consumers. */
    readonly generation?: number;
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
