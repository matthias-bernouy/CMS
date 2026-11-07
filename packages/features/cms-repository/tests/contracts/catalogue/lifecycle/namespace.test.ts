import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { admitProviderManifest } from "@bernouy/ulvia-providers";
import { InMemoryProviderManifestCatalogue } from "cms-repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { contractDocument } from "../../../../../../platform/contracts/tests/support/fixtures";
import { manifestDocument } from "../../../providers/support/fixtures";

test("two publishers independently publish the same contract and Provider names", async () => {
    const contracts = new InMemoryReleaseCatalogue();
    const providers = new InMemoryProviderManifestCatalogue(contracts);
    for (const publisherId of ["ulvia", "other"]) {
        const contractId = `${publisherId}/content`;
        const admission = await admitContractRelease(contractDocument({ contractId, publisherId, version: "1.0.0" }));
        await contracts.publish(admission);
        await providers.publish(
            await admitProviderManifest(
                manifestDocument([{ contractId, version: "1.0.0", digest: admission.digest, requires: [] }], {
                    providerId: `${publisherId}/primary-provider`,
                    provenance: { publisherId, publishedAt: "2026-11-05T00:00:00Z" },
                }),
                contracts,
            ),
        );
    }
    expect((await contracts.get("ulvia/content", "1.0.0"))?.admission.release.publisherId).toBe("ulvia");
    expect((await contracts.get("other/content", "1.0.0"))?.admission.release.publisherId).toBe("other");
    expect((await providers.get("ulvia/primary-provider", "1.0.0"))?.admission.manifest.provenance.publisherId).toBe(
        "ulvia",
    );
    expect((await providers.get("other/primary-provider", "1.0.0"))?.admission.manifest.provenance.publisherId).toBe(
        "other",
    );
    await expect(
        admitContractRelease(contractDocument({ contractId: "ulvia/content", publisherId: "other" })),
    ).rejects.toThrow("namespace must match");
    expect((await contracts.list()).length).toBe(2);
});
