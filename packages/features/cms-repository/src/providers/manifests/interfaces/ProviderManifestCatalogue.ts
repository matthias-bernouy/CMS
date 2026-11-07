import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import type {
    ProviderManifestReader,
    CatalogueProviderManifest,
    ProviderManifestYank,
} from "@bernouy/ulvia-providers/catalogue";

export interface ProviderManifestCatalogue extends ProviderManifestReader {
    /** Reverify artifact integrity and current contract references before publication. */
    publish(admission: AdmittedProviderManifest): Promise<CatalogueProviderManifest>;
    setYank(providerId: string, version: string, yank: ProviderManifestYank | null): Promise<CatalogueProviderManifest>;
}
