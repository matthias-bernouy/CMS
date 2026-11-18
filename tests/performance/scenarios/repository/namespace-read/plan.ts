import { budgetFor } from "../../../capabilities/policies";
import { executeNamespaceRead } from "./execute";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { ExecutableScenario } from "../../plan";

export function namespaceReadScenarios(inventory: CapabilityInventory, fixture: string): ExecutableScenario[] {
    return ["list-namespaces", "namespace-list", "namespace-get"].flatMap((capability) => {
        const contractId = capability === "list-namespaces" ? "ulvia/cms.authoring" : "ulvia/repository";
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capability,
        );
        if (!target) {
            throw new Error("Namespace read inventory is stale");
        }
        const variants: Variant[] =
            capability === "namespace-get" ? ["invalidation"] : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap((binding) =>
            variants.map((variant) => {
                const obligation = { target: target.key, binding: binding.id, variant };
                const definition = {
                    id: `namespace-read.${capability}.${binding.id}.${variant}`,
                    version: capability === "list-namespaces" ? 2 : 1,
                    fixture,
                    obligations: [obligation],
                    samples: 10,
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment) =>
                        executeNamespaceRead(inventory, environment, definition, obligation, capability),
                };
            }),
        );
    });
}
