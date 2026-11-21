import type { GatewayRoute } from "@bernouy/cms-gateway";
import type { AdmittedContractRelease, ResolvedContract } from "@bernouy/ulvia-contracts";

export function remoteRoute(
    base: GatewayRoute,
    view: ResolvedContract,
    admitted: AdmittedContractRelease,
    requested: AdmittedContractRelease,
): GatewayRoute {
    const pin = { contractId: admitted.release.contractId, version: admitted.release.version, digest: admitted.digest };
    return {
        ...base,
        manifest: {
            ...base.manifest,
            admission: {
                ...base.manifest.admission,
                manifest: { ...base.manifest.admission.manifest, implementations: [{ ...pin, requires: [] }] },
            },
        },
        installation: {
            ...base.installation,
            observation: {
                ...base.installation.observation!,
                report: {
                    ...base.installation.observation!.report,
                    implementations: [{ ...pin, status: "ready" }],
                },
            },
        },
        release: { ...base.release, admission: admitted },
        requestedRelease: { ...base.requestedRelease, admission: requested },
        selection: { ...base.selection, ...pin },
        lineage: view.lineage.map(({ release, digest }) => ({
            contractId: release.contractId,
            version: release.version,
            digest,
            name: release.name,
            capabilityIds: release.capabilities.map(({ id }) => id),
            ...(release.extends ? { extends: release.extends } : {}),
        })),
    };
}
