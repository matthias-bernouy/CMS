import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../../support/fixtures";

export async function manifestCatalogueFixture() {
    const contracts = await releaseCatalogue(contractDocument("forms.submission", "form.submission.create"));
    const release = (await contracts.get("forms.submission", "1.0.0"))!;
    const document = manifestDocument([implementation("forms.submission", "1.0.0", release.admission.digest)]);
    const admission = await admitProviderManifest(document, contracts);
    const catalogue = new InMemoryProviderManifestCatalogue(
        contracts,
        undefined,
        () => new Date("2026-09-24T10:00:00Z"),
    );
    return { contracts, document, admission, catalogue };
}
