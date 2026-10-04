export type RepositoryArtifactKind = "collection" | "contract" | "provider-manifest";

export type RemoteCoordinate = Readonly<{
    kind: RepositoryArtifactKind;
    publisherId: string;
    id: string;
    version: string;
}>;

export type PublicationAsset = Readonly<{ id: string; bytes: Uint8Array }>;

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

/** Storage-independent mutation boundary implemented by a repository server adapter. */
export interface RepositoryPublicationRegistry {
    publish(envelope: PublicationEnvelope): Promise<RepositoryPublicationResult>;
    setYank(coordinate: RemoteCoordinate, reason: string | null): Promise<RepositoryYankResult>;
}

/** Atomic replay claim. Production multi-node servers should provide a shared durable implementation. */
export interface RepositoryReplayStore {
    claim(signature: string, expiresAt: Date): Promise<boolean>;
}
