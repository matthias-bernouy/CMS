import type { ProviderManifestLinks } from "cms-repository/providers/manifests/interfaces/ProviderManifest";

export type RepositoryArtifactKind = "contract" | "provider-manifest";

export type RepositoryArtifactEntry = Readonly<{
    repositoryId: string;
    kind: RepositoryArtifactKind;
    publisherId: string;
    id: string;
    version: string;
    digest: string;
    name: string;
    description?: string;
    icon?: string;
    categories?: readonly string[];
    publishedAt?: string;
    links?: ProviderManifestLinks;
}>;

export type RepositoryArtifactReference = Pick<
    RepositoryArtifactEntry,
    "kind" | "publisherId" | "id" | "version" | "digest"
>;

/** A trusted, configured catalogue location; its bytes are still untrusted. */
export interface ProviderRepositorySource {
    readonly id: string;
    list(kind: RepositoryArtifactKind): Promise<readonly RepositoryArtifactEntry[]>;
    get(reference: RepositoryArtifactReference): Promise<Uint8Array>;
}
