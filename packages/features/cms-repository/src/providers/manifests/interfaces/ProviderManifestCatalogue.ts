import type {
    AdmittedProviderManifest,
    ProviderManifestDigest,
} from "cms-repository/providers/manifests/core/admission/admitProviderManifest";

export interface ProviderManifestYank {
    readonly reason: string;
}

export interface CatalogueProviderManifest {
    readonly admission: AdmittedProviderManifest;
    /** Catalogue acceptance time, independent of the manifest's provenance and digest. */
    readonly publishedAt: string;
    readonly yank?: ProviderManifestYank;
}

export interface ProviderManifestCatalogue {
    /** Optional token that changes on every publication or yank mutation. */
    revision?(): Promise<string>;
    findByDigest(digest: ProviderManifestDigest): Promise<CatalogueProviderManifest | null>;
    get(providerId: string, version: string): Promise<CatalogueProviderManifest | null>;
    /** Includes historical yanked versions, ordered by provider ID, then version. */
    list(providerId?: string): Promise<readonly CatalogueProviderManifest[]>;
    /** Reverify artifact integrity and current contract references before publication. */
    publish(admission: AdmittedProviderManifest): Promise<CatalogueProviderManifest>;
    setYank(providerId: string, version: string, yank: ProviderManifestYank | null): Promise<CatalogueProviderManifest>;
}
