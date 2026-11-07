import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { planContractPublications } from "cms-repository/exports/contracts/catalogue";
import { type ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import { validateProviderManifestReferences } from "@bernouy/ulvia-providers/validation";
import { ProviderManifestValidationError } from "@bernouy/ulvia-providers";
import type { CatalogueProviderManifest } from "@bernouy/ulvia-providers/catalogue";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import { stagedReleaseCatalogue } from "./stagedReleaseCatalogue";

/** Completes every semantic catalogue check before the first publication mutation. */
export async function publishProviderImport(
    dependencies: readonly AdmittedContractRelease[],
    admission: AdmittedProviderManifest,
    contracts: ReleaseCatalogue,
    manifests: ProviderManifestCatalogue,
): Promise<CatalogueProviderManifest> {
    const publications = await planContractPublications(contracts, dependencies);
    const stagedContracts = stagedReleaseCatalogue(contracts, publications);
    await validateProviderManifestReferences(admission.manifest, stagedContracts);
    await assertManifestPublication(admission, manifests);
    for (const dependency of publications) {
        await contracts.publish(dependency);
    }
    return manifests.publish(admission);
}

async function assertManifestPublication(
    admission: AdmittedProviderManifest,
    catalogue: ProviderManifestCatalogue,
): Promise<void> {
    const { providerId, version, provenance } = admission.manifest;
    const [existing, digestOwner, history] = await Promise.all([
        catalogue.get(providerId, version),
        catalogue.findByDigest(admission.digest),
        catalogue.list(providerId),
    ]);
    if (existing && existing.admission.digest !== admission.digest) {
        throw new ProviderManifestValidationError("invalid_manifest", `${providerId}@${version} is already published`);
    }
    if (
        digestOwner &&
        (digestOwner.admission.manifest.providerId !== providerId || digestOwner.admission.manifest.version !== version)
    ) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "manifest digest is already assigned",
            "$.digest",
        );
    }
    if (history.some((record) => record.admission.manifest.provenance.publisherId !== provenance.publisherId)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "publisher ownership cannot change between manifest versions",
            "$.provenance.publisherId",
        );
    }
}
