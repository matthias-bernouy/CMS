import { ReleaseValidationError } from "../protocol/errors";
import { deepFreeze } from "../protocol/values";
import type { ContractRelease } from "../../interfaces/ContractRelease";
import type { CompiledCapabilityBinding } from "../../interfaces/HttpBinding";
import { compileHttpBinding } from "./http/compile";
import { pathTemplatesOverlap } from "./pathTemplate";

import { capabilityBindings } from "./definitions";

export function compileContractBindings(release: ContractRelease): readonly CompiledCapabilityBinding[] {
    const toolNames = new Set<string>();
    const compiled = release.capabilities.flatMap((capability) =>
        capabilityBindings(capability).flatMap((definition) => {
            if (definition.transport === "mcp") {
                const name = definition.tool?.name ?? `${capability.id}:${definition.id}`;
                if (toolNames.has(name)) {
                    throw new ReleaseValidationError("invalid_binding", "duplicate MCP tool names", "$.capabilities");
                }
                toolNames.add(name);
                return [];
            }
            return [
                {
                    capabilityId: capability.id,
                    bindingId: definition.id,
                    binding: compileHttpBinding(capability, definition),
                },
            ];
        }),
    );
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
