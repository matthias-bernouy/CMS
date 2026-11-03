export type RepositoryArtifactKind = "collection" | "contract" | "provider-manifest";

export type RemoteCoordinate = Readonly<{
    kind: RepositoryArtifactKind;
    publisherId: string;
    id: string;
    version: string;
}>;

export type PublicationAsset = Readonly<{ id: string; bytes: Uint8Array | Blob }>;

export type RepositoryDownloadAsset = Readonly<{
    id: string;
    byteLength: number;
    digest: `sha256:${string}`;
    mediaType: string;
}>;

export type PublicationEnvelope = Readonly<{
    kind: RepositoryArtifactKind;
    canonicalJson: string;
    assets: readonly PublicationAsset[];
}>;

export type RepositoryPublicationResult = Readonly<{
    kind: RepositoryArtifactKind;
    added: boolean;
    digest: string;
    release: unknown;
}>;

export type RepositoryYank = Readonly<{ reason: string; yankedAt: string }>;
export type RepositoryYankResult = RemoteCoordinate & Readonly<{ yank: RepositoryYank | null }>;

export type PublicationUploadAsset = Readonly<{
    id: string;
    byteLength: number;
    digest: `sha256:${string}`;
}>;

export type PublicationUploadManifest = Readonly<{
    kind: RepositoryArtifactKind;
    canonicalJson: string;
    assets: readonly PublicationUploadAsset[];
}>;

export type PublicationUploadReceipt = Readonly<{
    uploadId: string;
    expiresAt: string;
    /** Assets already durably staged and verified for this manifest. */
    uploadedAssetIds: readonly string[];
}>;

export type RepositoryUploadOwner = Readonly<{
    accountId: string;
    namespace: string;
    namespaceRevision: number;
}>;

/** Server-owned metadata; never accepted as part of the client's upload manifest. */
export type OwnedPublicationUploadManifest = PublicationUploadManifest & Readonly<{ owner: RepositoryUploadOwner }>;

/** Storage-independent mutation boundary implemented by a repository server adapter. */
export interface RepositoryPublicationRegistry {
    publish(envelope: PublicationEnvelope): Promise<RepositoryPublicationResult>;
    setYank(
        coordinate: RemoteCoordinate,
        reason: string | null,
        expectedRevision?: number,
    ): Promise<RepositoryYankResult>;
    getPublicationState?(coordinate: RemoteCoordinate): Promise<{ revision: number; yank: RepositoryYank | null }>;
}

/** Durable staging boundary. Assets stay invisible until the supplied publication callback succeeds. */
export interface RepositoryPublicationUploadStore {
    describe(uploadId: string): Promise<OwnedPublicationUploadManifest>;
    create(manifest: OwnedPublicationUploadManifest, expiresAt: Date): Promise<PublicationUploadReceipt>;
    status(uploadId: string): Promise<PublicationUploadReceipt>;
    putAsset(
        uploadId: string,
        assetId: string,
        body: ReadableStream<Uint8Array> | null,
        contentDigest: `sha256:${string}`,
        contentLength?: number,
    ): Promise<void>;
    commit(
        uploadId: string,
        publish: (envelope: PublicationEnvelope) => Promise<RepositoryPublicationResult>,
    ): Promise<RepositoryPublicationResult>;
    abort(uploadId: string): Promise<void>;
}
