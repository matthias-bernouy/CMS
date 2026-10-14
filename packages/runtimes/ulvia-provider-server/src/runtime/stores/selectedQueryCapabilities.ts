import type { BindingQueryCapability, BindingQueryCapabilityResolver } from "@bernouy/cms-content/page-document";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";

export function selectedQueryCapabilityResolver(
    siteId: string,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
): BindingQueryCapabilityResolver {
    return async (targets) => {
        if (targets.length === 0) {
            return [];
        }
        const stored = await selections.get(siteId);
        if (!stored) {
            throw new Error(`Contract selections are unavailable for site ${JSON.stringify(siteId)}`);
        }
        const result: BindingQueryCapability[] = [];
        for (const target of targets) {
            const selection = stored.plan.selections.find(({ contractId }) => contractId === target.contractId);
            if (!selection) {
                throw new Error(`Contract ${JSON.stringify(target.contractId)} is not selected for this site`);
            }
            const record = await releases.get(selection.contractId, selection.version);
            if (!record || record.admission.digest !== selection.digest) {
                throw new Error(
                    `Selected contract ${selection.contractId}@${selection.version} is unavailable or invalid`,
                );
            }
            const capability = record.admission.release.capabilities.find(({ id }) => id === target.capabilityId);
            if (!capability || capability.behavior.effect !== "query" || capability.output.type === "binary") {
                throw new Error(
                    `Capability ${target.contractId}:${target.capabilityId} is not an available structured query`,
                );
            }
            result.push({
                contractId: target.contractId,
                capabilityId: target.capabilityId,
                output: capability.output,
                errors: capability.errors,
            });
        }
        return result;
    };
}
