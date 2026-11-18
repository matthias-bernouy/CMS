import { budgetFor } from "../../../../capabilities/policies";
import { executeOAuthRead } from "./cases";
import type { CapabilityInventory, Variant } from "../../../../capabilities/types";
import type { ExecutableScenario } from "../../../plan";

export function oauthReadScenarios(inventory: CapabilityInventory, fixture: string): ExecutableScenario[] {
    return ["list-mcp-connections", "resolve-mcp-connection"].flatMap((capability) => {
        const target = inventory.targets.find(
            (entry) =>
                !entry.retained &&
                entry.release.contractId === "ulvia/cms.access" &&
                entry.definition.id === capability,
        );
        if (!target || !target.definition.bindings.some((binding) => binding.id === "http")) {
            throw new Error("OAuth read performance inventory is stale");
        }
        const variants: Variant[] =
            capability === "list-mcp-connections" ? ["large", "history", "invalidation"] : ["invalidation"];
        return variants.map((variant) => {
            const obligation = { target: target.key, binding: "http", variant };
            const definition = {
                id: `access-oauth-read.${capability}.http.${variant}`,
                version: 1,
                fixture,
                obligations: [obligation],
                budget: budgetFor(target, variant),
                samples: 10,
            };
            return {
                definition,
                execute: (environment) => executeOAuthRead(inventory, environment, definition, obligation, capability),
            };
        });
    });
}
