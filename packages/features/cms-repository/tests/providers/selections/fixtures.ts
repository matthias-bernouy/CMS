import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { parseProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection, ContractSelectionContext } from "@bernouy/cms-repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { installationDocument } from "../installations/fixtures";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

export const siteId = "site:STORE_1";

export async function installationFor(
    releases: ReleaseCatalogue,
    manifests: InMemoryProviderManifestCatalogue,
    claims: Record<string, unknown>[],
    providerId = "ulvia.example",
) {
    const admission = await admitProviderManifest(manifestDocument(claims, { providerId }), releases);
    await manifests.publish(admission);
    return parseProviderInstallation({
        ...installationDocument(),
        id: `installation:${providerId}`,
        providerId,
        configuration: {},
        approval: { ...installationDocument().approval, manifestDigest: admission.digest },
    });
}

export async function graphFixture(extraRequirements: Record<string, unknown>[] = []) {
    const commerce = (version: string, versionRange: string) => {
        const document = contractDocument("commerce", "checkout", version);
        (document.capabilities as Record<string, unknown>[])[0]!.requires = [
            { contractId: "payment", capabilityId: "pay", versionRange },
        ];
        return document;
    };
    const releases = await releaseCatalogue(
        contractDocument("payment", "pay"),
        contractDocument("payment", "pay", "2.0.0"),
        contractDocument("emailer", "send"),
        contractDocument("emailer", "deliver", "2.0.0"),
        commerce("1.0.0", "^1.0.0"),
        commerce("1.1.0", "^1.0.0 || ^2.0.0"),
    );
    const manifests = new InMemoryProviderManifestCatalogue(releases);
    const claims = (await releases.list()).map(({ admission }) => {
        const { contractId, version } = admission.release;
        const requires =
            contractId === "commerce"
                ? [
                      requirement("payment", "pay", version === "1.0.0" ? "^1.0.0" : "^1.0.0 || ^2.0.0"),
                      ...extraRequirements,
                  ]
                : [];
        return implementation(contractId, version, admission.digest, requires);
    });
    const installation = await installationFor(releases, manifests, claims);
    const context: ContractSelectionContext = { releases, manifests, installations: [installation] };
    const select = async (contractId: string, version = "1.0.0"): Promise<ContractSelection> => ({
        siteId,
        contractId,
        version,
        digest: (await releases.get(contractId, version))!.admission.digest,
        installationId: installation.id,
    });
    return { context, releases, manifests, installation, select };
}
