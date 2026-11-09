import type { PublicationStateInput } from "repository/application/registry/interfaces/inputs";
import type {
    PublicationStateOutput,
    PublicationBeginOutput,
} from "repository/application/registry/interfaces/outputs";
export type RemoteCoordinate = Readonly<PublicationStateInput>;
export type RepositoryArtifactKind = RemoteCoordinate["kind"];

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
    /** Exact editable sources for Repository-owned collection compilation. */
    sourceJson?: string;
    assets: readonly PublicationAsset[];
}>;

export type RepositoryPublicationResult = Readonly<{
    kind: RepositoryArtifactKind;
    added: boolean;
    digest: string;
    release: unknown;
}>;

export type RepositoryYank = NonNullable<PublicationStateOutput["yank"]>;
export type RepositoryYankResult = RemoteCoordinate & Readonly<{ yank: RepositoryYank | null }>;

export type PublicationUploadAsset = Readonly<{
    id: string;
    byteLength: number;
    digest: `sha256:${string}`;
}>;

export type PublicationUploadManifest = Readonly<{
    kind: RepositoryArtifactKind;
    canonicalJson: string;
    /** Exact editable sources for Repository-owned collection compilation. */
    sourceJson?: string;
    assets: readonly PublicationUploadAsset[];
}>;

export type PublicationUploadReceipt = PublicationBeginOutput;

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
    buildCollection?(
        envelope: PublicationEnvelope,
        finalize: (publish: () => Promise<RepositoryPublicationResult>) => Promise<RepositoryPublicationResult>,
        signal?: AbortSignal,
    ): Promise<RepositoryPublicationResult>;
    retainCollectionSources?(coordinate: RemoteCoordinate, sourceJson: string, releaseDigest: string): Promise<void>;
    checkCollection?(canonicalJson: string, namespace: string): Promise<{ complete: boolean; digest: string }>;
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
