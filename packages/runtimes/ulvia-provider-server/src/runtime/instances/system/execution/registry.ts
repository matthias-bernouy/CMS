import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../../../stores/providerStores";
import type { ProviderExecutionSupport } from "./support";
import { readInstalledExecution } from "./installed";
import { readStoredPlan } from "./plan";

/** Registry comes from the instance's approved manifest, including after an image replacement. */
export async function registryInstallationPlan(
    instance: ProviderInstanceRecord,
    stores: Pick<ProviderStores, "releases" | "manifests" | "installations" | "selections">,
    support: ProviderExecutionSupport,
    endpoint: string,
) {
    const { plan: source } = await readInstalledExecution(instance, stores, support, endpoint);
    const manifest = await stores.manifests.get(source.manifest.providerId, source.manifest.version);
    if (!manifest || manifest.admission.digest !== source.manifest.digest) {
        throw new Error("Approved system manifest changed during Registry planning");
    }
    const claim = manifest.admission.manifest.implementations.find(
        ({ contractId }) => contractId === "ulvia/repository",
    );
    if (!claim) {
        throw new Error("The approved system manifest has no Registry implementation");
    }
    const registry = { contractId: claim.contractId, version: claim.version, digest: claim.digest };
    const target = {
        ...source,
        contracts: [...source.contracts.filter(({ contractId }) => contractId !== registry.contractId), registry],
    };
    await readStoredPlan(target, stores, support);
    return { source, target };
}
