import { admitContractReleaseJson, type AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";

/** Reconstruct retained immutable fixtures; current authored contracts keep only their latest minor. */
export async function historicalContracts(admissions: readonly AdmittedContractRelease[]) {
    const result: AdmittedContractRelease[] = [];
    for (const [id, version] of [
        ["ulvia.cms.observability", "1.0.0"],
        ["ulvia.cms.content", "1.0.0"],
        ["ulvia.cms.installations", "1.0.0"],
        ["ulvia.cms.installations", "1.1.0"],
    ]) {
        const value = JSON.parse(admissions.find((item) => item.release.contractId === id)!.canonicalJson);
        value.version = version;
        if (id === "ulvia.cms.observability") {
            for (const capability of value.capabilities) {
                capability.bindings = capability.bindings.filter(
                    (binding: { transport: string }) => binding.transport !== "mcp",
                );
            }
        } else if (id === "ulvia.cms.content") {
            delete value.capabilities.find((item: { id: string }) => item.id === "delivery.resolve-path").input
                .properties.resourceMetadata;
        } else {
            delete value.capabilities.find((item: { id: string }) => item.id === "gateway.dispatch.prepare").input
                .properties.closedDelegations;
            value.capabilities = value.capabilities.filter(
                (item: { id: string }) =>
                    item.id !== "gateway.provider.prepare" &&
                    (version !== "1.0.0" || item.id !== "gateway.dispatch.prepare"),
            );
        }
        result.push(await admitContractReleaseJson(JSON.stringify(value)));
    }
    return result;
}

export async function historicalManifests(
    current: string,
    catalogue: InMemoryReleaseCatalogue,
    admissions: readonly AdmittedContractRelease[],
) {
    return Promise.all(
        ["0.1.0", "0.2.0", "0.3.0"].map(async (version) => {
            const value = JSON.parse(current);
            value.version = version;
            value.provenance.publishedAt = version === "0.1.0" ? "2026-10-01T00:00:00Z" : "2026-10-28T00:00:00Z";
            for (const pin of value.implementations) {
                const previous =
                    pin.contractId === "ulvia.cms.content"
                        ? "1.0.0"
                        : pin.contractId === "ulvia.cms.installations"
                          ? version === "0.3.0"
                              ? "1.1.0"
                              : "1.0.0"
                          : pin.contractId === "ulvia.cms.observability" && version === "0.1.0"
                            ? "1.0.0"
                            : undefined;
                if (previous) {
                    const contract = admissions.find(
                        (item) => item.release.contractId === pin.contractId && item.release.version === previous,
                    )!;
                    pin.version = previous;
                    pin.digest = contract.digest;
                }
            }
            return admitProviderManifestJson(JSON.stringify(value), catalogue);
        }),
    );
}
