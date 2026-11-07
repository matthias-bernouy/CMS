import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { verifyStoredProviderManifestJson } from "@bernouy/ulvia-providers";
import { bundledBootstrapSources } from "../../../../src/runtime/instances/profiles/bootstrap";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/profiles/execution/support";

/** Use the actual generated bootstrap and execution support matrix, not handwritten SMTP pins. */
async function readPreparedEmailer() {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(
        ({ release }) => release.contractId === "ulvia/cms.emailer.smtp",
    );
    const source = bundledBootstrapSources().providers;
    const support = new ProviderExecutionSupport();
    const reference = (await source.list("provider-manifest")).find(({ id }) => id === support.providerId);
    if (!reference) {
        throw new Error("Generated Provider manifest is missing");
    }
    const manifest = await verifyStoredProviderManifestJson(await source.get(reference), reference.digest);
    const releases = manifest.manifest.implementations.filter(({ contractId }) =>
        contracts.some(({ release }) => release.contractId === contractId),
    );
    if (releases.length !== contracts.length) {
        throw new Error("Generated manifest does not cover the surface's feature inventory");
    }
    for (const release of releases) {
        support.assert(release, "SMTP journey");
    }
    return { contracts, manifest, releases, buildVersion: support.buildVersion };
}

let preparation: ReturnType<typeof readPreparedEmailer> | undefined;
export const preparedEmailer = () => (preparation ??= readPreparedEmailer());
