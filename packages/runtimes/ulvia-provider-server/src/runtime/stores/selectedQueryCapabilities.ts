import type {
    BindingCapability,
    BindingCapabilityResolver,
    BindingQueryCapability,
    BindingQueryCapabilityResolver,
} from "@bernouy/cms-content/page-document";
import { ContentValidationError } from "@bernouy/cms-content";
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
                throw unavailableBinding(target.contractId, target.capabilityId);
            }
            const record = await releases.get(selection.contractId, selection.version);
            if (!record || record.admission.digest !== selection.digest) {
                throw new Error(
                    `Selected contract ${selection.contractId}@${selection.version} is unavailable or invalid`,
                );
            }
            const capability = record.admission.release.capabilities.find(({ id }) => id === target.capabilityId);
            if (!capability || capability.behavior.effect !== "query" || capability.output.type === "binary") {
                throw unavailableBinding(target.contractId, target.capabilityId, "structured query");
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

export function selectedCapabilityResolver(
    siteId: string,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
): BindingCapabilityResolver {
    return async (targets) => {
        if (targets.length === 0) {
            return [];
        }
        const stored = await selections.get(siteId);
        if (!stored) {
            throw new Error(`Contract selections are unavailable for site ${JSON.stringify(siteId)}`);
        }
        const result: BindingCapability[] = [];
        for (const target of targets) {
            const selection = stored.plan.selections.find(({ contractId }) => contractId === target.contractId);
            if (!selection) {
                throw unavailableBinding(target.contractId, target.capabilityId);
            }
            const record = await releases.get(selection.contractId, selection.version);
            if (!record || record.admission.digest !== selection.digest) {
                throw new Error(
                    `Selected contract ${selection.contractId}@${selection.version} is unavailable or invalid`,
                );
            }
            const capability = record.admission.release.capabilities.find(({ id }) => id === target.capabilityId);
            if (!capability || capability.behavior.effect !== target.effect || capability.output.type === "binary") {
                throw unavailableBinding(target.contractId, target.capabilityId, `structured ${target.effect}`);
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

function unavailableBinding(contractId: string, capabilityId: string, expected?: string): ContentValidationError {
    return new ContentValidationError(
        "content",
        expected
            ? `capability ${contractId}:${capabilityId} is not an available ${expected}`
            : `contract ${JSON.stringify(contractId)} is not selected for this site`,
    );
}
