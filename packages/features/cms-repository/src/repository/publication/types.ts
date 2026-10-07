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

export type ConformanceEvidenceCoordinate = Readonly<{
    providerId: string;
    contractId: string;
    evidenceId: string;
}>;

export type ConformanceEvidencePublicationResult = ConformanceEvidenceCoordinate &
    Readonly<{ added: boolean; digest: `sha256:${string}` }>;

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

/** Storage-independent mutation boundary implemented by a repository server adapter. */
export interface RepositoryPublicationRegistry {
    publish(envelope: PublicationEnvelope): Promise<RepositoryPublicationResult>;
    publishEvidence(canonicalJson: string): Promise<ConformanceEvidencePublicationResult>;
    setYank(coordinate: RemoteCoordinate, reason: string | null): Promise<RepositoryYankResult>;
}

/** Atomic replay claim. Production multi-node servers should provide a shared durable implementation. */
export interface RepositoryReplayStore {
    claim(signature: string, expiresAt: Date): Promise<boolean>;
}

/** Durable staging boundary. Assets stay invisible until the supplied publication callback succeeds. */
export interface RepositoryPublicationUploadStore {
    create(manifest: PublicationUploadManifest, expiresAt: Date): Promise<PublicationUploadReceipt>;
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
