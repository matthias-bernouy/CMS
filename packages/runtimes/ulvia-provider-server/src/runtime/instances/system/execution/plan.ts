import { resolveContract } from "@bernouy/ulvia-contracts";
import type { SystemInstallationPlan } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../../../stores/providerStores";
import type { ProviderExecutionSupport } from "./support";
export async function readStoredPlan(
    plan: SystemInstallationPlan,
    stores: Pick<ProviderStores, "releases" | "manifests">,
    support: ProviderExecutionSupport,
) {
    const manifest = await stores.manifests.get(plan.manifest.providerId, plan.manifest.version);
    if (
        !manifest ||
        manifest.admission.digest !== plan.manifest.digest ||
        plan.manifest.providerId !== support.providerId
    ) {
        throw new Error("Exact admitted system manifest is unavailable");
    }
    return Promise.all(
        plan.contracts.map(async (pin) => {
            support.assert(pin, "system installation");
            if (
                !manifest.admission.manifest.implementations.some(
                    (claim) =>
                        claim.contractId === pin.contractId &&
                        claim.version === pin.version &&
                        claim.digest === pin.digest,
                )
            ) {
                throw new Error("System plan is outside the admitted manifest");
            }
            const stored = await stores.releases.get(pin.contractId, pin.version);
            if (!stored || stored.admission.digest !== pin.digest) {
                throw new Error("Exact admitted system contract is unavailable");
            }
            return resolveContract(stores.releases, stored.admission);
        }),
    );
}
