import type {
    AdmittedProviderManifest,
    ProviderManifestDigest,
} from "ulvia-providers/manifests/core/admission/admitProviderManifest";

export interface ProviderManifestYank {
    readonly reason: string;
}

export interface CatalogueProviderManifest {
    readonly admission: AdmittedProviderManifest;
    /** Catalogue acceptance time, independent of the manifest's provenance and digest. */
    readonly publishedAt: string;
    readonly yank?: ProviderManifestYank;
}

export interface ProviderManifestReader {
    /** Optional token that changes on every publication or yank mutation. */
    revision?(): Promise<string>;
    findByDigest(digest: ProviderManifestDigest): Promise<CatalogueProviderManifest | null>;
    get(providerId: string, version: string): Promise<CatalogueProviderManifest | null>;
    /** Includes historical yanked versions, ordered by provider ID, then version. */
    list(providerId?: string): Promise<readonly CatalogueProviderManifest[]>;
}
