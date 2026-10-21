import type {
    BindingCapability,
    BindingCapabilityResolver,
    BindingQueryCapability,
    BindingQueryCapabilityResolver,
} from "@bernouy/cms-content/page-document";
import { ContentValidationError, type SvgCapabilityValidator } from "@bernouy/cms-content";
import { compileContractBindings, matchPathTemplate } from "@bernouy/cms-repository/contracts/bindings";
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

export function selectedPublicSvgCapabilityValidator(
    siteId: string,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
): SvgCapabilityValidator {
    return async (targets) => {
        const stored = await selections.get(siteId);
        if (!stored) {
            throw new Error(`Contract selections are unavailable for site ${JSON.stringify(siteId)}`);
        }
        for (const target of targets) {
            const selection = stored.plan.selections.find(({ contractId }) => contractId === target.contractId);
            if (!selection) {
                throw unavailableSvgCapability(target.contractId, target.bindingPath);
            }
            const record = await releases.get(selection.contractId, selection.version);
            if (!record || record.admission.digest !== selection.digest) {
                throw new Error(
                    `Selected contract ${selection.contractId}@${selection.version} is unavailable or invalid`,
                );
            }
            const compiled = compileContractBindings(record.admission.release).find(
                ({ binding }) =>
                    binding.method === "GET" && matchPathTemplate(binding.path, target.bindingPath) !== null,
            );
            const capability = compiled
                ? record.admission.release.capabilities.find(({ id }) => id === compiled.capabilityId)
                : undefined;
            if (
                !capability ||
                capability.access !== "public" ||
                capability.output.type !== "binary" ||
                capability.output.nullable === true ||
                !compiled?.binding.response.contentTypes.includes("image/svg+xml") ||
                hasRequiredNonPathInput(capability.input.required, compiled.binding)
            ) {
                throw unavailableSvgCapability(target.contractId, target.bindingPath);
            }
        }
    };
}

function hasRequiredNonPathInput(
    required: readonly string[],
    binding: { readonly query: readonly { property: string }[]; readonly headers: readonly { property: string }[] },
): boolean {
    const requiredNames = new Set(required);
    return [...binding.query, ...binding.headers].some(({ property }) => requiredNames.has(property));
}

function unavailableBinding(contractId: string, capabilityId: string, expected?: string): ContentValidationError {
    return new ContentValidationError(
        "content",
        expected
            ? `capability ${contractId}:${capabilityId} is not an available ${expected}`
            : `contract ${JSON.stringify(contractId)} is not selected for this site`,
    );
}

function unavailableSvgCapability(contractId: string, bindingPath: string): ContentValidationError {
    return new ContentValidationError(
        "content",
        `cms-svg target ${contractId}${bindingPath} is not an available public SVG GET capability`,
    );
}
