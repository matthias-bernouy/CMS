import { ReleaseValidationError } from "../protocol/errors";
import { deepFreeze } from "../protocol/values";
import type { ContractRelease } from "../../interfaces/ContractRelease";
import type { CompiledCapabilityBinding } from "../../interfaces/HttpBinding";
import { compileHttpBinding } from "./compileHttpBinding";
import { pathTemplatesOverlap } from "./pathTemplate";

export function compileContractBindings(release: ContractRelease): readonly CompiledCapabilityBinding[] {
    const compiled = release.capabilities.map((capability) => ({
        capabilityId: capability.id,
        binding: compileHttpBinding(capability),
    }));
    for (let leftIndex = 0; leftIndex < compiled.length; leftIndex += 1) {
        const left = compiled[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < compiled.length; rightIndex += 1) {
            const right = compiled[rightIndex]!;
            if (
                left.binding.method === right.binding.method &&
                pathTemplatesOverlap(left.binding.path, right.binding.path)
            ) {
                throw new ReleaseValidationError(
                    "invalid_binding",
                    `${left.capabilityId} and ${right.capabilityId} have overlapping HTTP routes`,
                    "$.capabilities",
                );
            }
        }
    }
    return deepFreeze(compiled) as readonly CompiledCapabilityBinding[];
}
