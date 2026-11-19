import { describe, expect, test } from "bun:test";
import { InMemoryProviderManifestCatalogue } from "repository/providers/manifests/default-implementation/InMemoryProviderManifestCatalogue";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { planContractSelections, type ContractSelection } from "@bernouy/ulvia-providers/selections";
import { contractDocument, implementation, releaseCatalogue, requirement } from "../../support/fixtures";
import { graphFixture, installationFor, siteId } from "../fixtures";

test("lets one specialized selection satisfy consumers of its parent", async () => {
    const releases = new InMemoryReleaseCatalogue();
    const emailer = await admitContractRelease(contractDocument("ulvia/emailer", "send"));
    await releases.publish(emailer);
    const smtpDocument = contractDocument("ulvia/emailer.smtp", "send");
    smtpDocument.extends = {
        contractId: "ulvia/emailer",
        version: "1.0.0",
        digest: emailer.digest,
    };
    smtpDocument.capabilities = [
        {
            ...(smtpDocument.capabilities as Record<string, unknown>[])[0],
            id: "smtp.configure",
            bindings: [
                {
                    id: "http",
                    ...((smtpDocument.capabilities as Record<string, unknown>[])[0]!.bindings[0] as object),
                    path: "/v1/smtp/configuration",
                },
            ],
        },
    ];
    const smtp = await admitContractRelease(smtpDocument);
    await releases.publish(smtp);
    const commerceDocument = contractDocument("ulvia/commerce", "checkout");
    const commerce = await admitContractRelease(commerceDocument);
    await releases.publish(commerce);
    const manifests = new InMemoryProviderManifestCatalogue(releases);
    const installation = await installationFor(releases, manifests, [
        implementation("ulvia/commerce", "1.0.0", commerce.digest, [requirement("ulvia/emailer", "send")]),
        implementation("ulvia/emailer.smtp", "1.0.0", smtp.digest),
    ]);
    const baseInstallation = await installationFor(
        releases,
        manifests,
        [implementation("ulvia/emailer", "1.0.0", emailer.digest)],
        "ulvia.base-email",
    );
    const selection = (
        contractId: string,
        digest: `sha256:${string}`,
        installationId = installation.id,
    ): ContractSelection => ({
        siteId,
        contractId,
        version: "1.0.0",
        digest,
        installationId,
    });
    const context = { releases, manifests, installations: [installation, baseInstallation] };

    const plan = await planContractSelections(
        siteId,
        [selection("ulvia/commerce", commerce.digest), selection("ulvia/emailer.smtp", smtp.digest)],
        context,
    );

    expect(plan.structurallyValid).toBe(true);
    expect(plan.dependencies).toContainEqual(expect.objectContaining({ contractId: "ulvia/emailer", present: true }));
    await expect(
        planContractSelections(
            siteId,
            [
                selection("ulvia/emailer", emailer.digest, baseInstallation.id),
                selection("ulvia/emailer.smtp", smtp.digest),
            ],
            context,
        ),
    ).rejects.toMatchObject({ code: "duplicate_selection" });
});
