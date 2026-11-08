import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { ContentValidationError } from "@bernouy/content";
import type { BindingCapabilityResolver } from "@bernouy/content/page-document";
import type { SvgCapabilityValidator } from "@bernouy/content";
import { compileContractBindings, matchPathTemplate } from "@bernouy/ulvia-contracts/bindings";
import type { ResourceInitializationExecution } from "@bernouy/resources/initialization";

export function resourcePreviewBindings(execution: ResourceInitializationExecution) {
    const compiled = new Map<string, ReturnType<typeof compileContractBindings>>();
    const svgBindings = (selected: ResolvedContract) => {
        let bindings = compiled.get(selected.digest);
        if (!bindings) {
            bindings = selected.lineage.flatMap(({ release }) => compileContractBindings(release));
            compiled.set(selected.digest, bindings);
        }
        return bindings;
    };
    const resolveCapabilities: BindingCapabilityResolver = async (targets) =>
        targets.map((target) => {
            const selected = execution.selected.find(({ release }) => release.contractId === target.contractId);
            const capability = selected?.capabilities.find(
                ({ definition }) => definition.id === target.capabilityId,
            )?.definition;
            if (
                !capability ||
                capability.behavior.effect !== target.effect ||
                capability.output.type === "binary" ||
                execution.denied.some(
                    (item) => item.contractId === target.contractId && item.capabilityId === target.capabilityId,
                )
            ) {
                throw new ContentValidationError(
                    "content",
                    "Resource binding requires an available selected capability",
                );
            }
            return {
                contractId: target.contractId,
                capabilityId: target.capabilityId,
                output: capability.output,
                errors: capability.errors,
            };
        });
    const validateSvgCapabilities: SvgCapabilityValidator = async (targets) => {
        for (const target of targets) {
            const selected = execution.selected.find(({ release }) => release.contractId === target.contractId);
            const binding =
                selected &&
                svgBindings(selected).find(
                    ({ binding }) =>
                        binding.method === "GET" && matchPathTemplate(binding.path, target.bindingPath) !== null,
                );
            const capability =
                binding &&
                selected?.capabilities.find(({ definition }) => definition.id === binding.capabilityId)?.definition;
            if (
                !binding ||
                !capability ||
                capability.access !== "public" ||
                capability.output.type !== "binary" ||
                capability.output.nullable === true ||
                !binding.binding.response.contentTypes.includes("image/svg+xml") ||
                [...binding.binding.query, ...binding.binding.headers].some(({ property }) =>
                    capability.input.required.includes(property),
                ) ||
                execution.denied.some(
                    (item) => item.contractId === target.contractId && item.capabilityId === capability.id,
                )
            ) {
                throw new ContentValidationError(
                    "content",
                    "Resource SVG requires an available public SVG GET capability",
                );
            }
        }
    };
    return {
        resolveCapabilities,
        requireQueryCapabilityResolution: true,
        validateSvgCapabilities,
        requireSvgCapabilityResolution: true,
    };
}
