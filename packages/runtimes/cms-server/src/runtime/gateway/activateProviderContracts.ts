import type { ProductionGateway } from "./createProductionGateway";

/** Pin one contract release to one approved provider account. */
export async function activateProviderContract(
    gateway: ProductionGateway,
    input: { installationId: string; contractId: string; version: string; digest: string },
) {
    const installed = await gateway.installations.get({ siteId: gateway.siteId, installationId: input.installationId });
    if (!installed || installed.installation.status !== "enabled") {
        throw new Error("Enabled provider installation not found");
    }
    const { providerId, approval } = installed.installation;
    const manifest = await gateway.manifests.get(providerId, approval.manifestVersion);
    const implementation = manifest?.admission.manifest.implementations.find(
        (item) =>
            item.contractId === input.contractId && item.version === input.version && item.digest === input.digest,
    );
    if (!manifest || manifest.admission.digest !== approval.manifestDigest || !implementation) {
        throw new Error("Contract release is not approved for this provider");
    }
    const observed = installed.observation?.report.implementations.some(
        (item) =>
            item.contractId === input.contractId &&
            item.version === input.version &&
            item.digest === input.digest &&
            item.status === "ready",
    );
    if (!observed) {
        throw new Error("Provider has not reported this contract release as ready");
    }
    const release = await gateway.releases.get(input.contractId, input.version);
    if (!release || release.admission.digest !== input.digest) {
        throw new Error("Contract release must be imported before selection");
    }
    const existing = await gateway.selections.get(gateway.siteId);
    const selections = [
        ...(existing?.plan.selections ?? []).filter((item) => item.contractId !== input.contractId),
        { siteId: gateway.siteId, ...input },
    ];
    const result = await gateway.selections.replace(gateway.siteId, selections, existing?.revision ?? 0);
    return { revision: result.revision, selected: result.plan.selections };
}
