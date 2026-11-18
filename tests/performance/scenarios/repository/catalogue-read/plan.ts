import { budgetFor } from "../../../capabilities/policies";
import { assertCondition } from "../../queries/types";
import { freshTenants } from "../../installations/fresh";
import { registryReadContexts } from "./context";
import { executeRegistryRead } from "./execute";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function registryReadScenarios(inventory: CapabilityInventory, fixture: string) {
    const contexts = registryReadContexts(inventory);
    const fresh = freshTenants(inventory);
    return [
        "catalogue-list",
        "catalogue-search",
        "collection-catalogue",
        "bootstrap-recipes",
        "repository-info",
        "publication-build-status",
    ].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === "ulvia/repository" && row.definition.id === capability,
        );
        assertCondition(target, "registry-read-inventory-stale");
        const variants: readonly Variant[] = ["catalogue-list", "catalogue-search", "collection-catalogue"].includes(
            capability,
        )
            ? ["large", "history", "invalidation"]
            : ["invalidation"];
        return target.definition.bindings
            .map(({ id: binding }) =>
                variants.map((variant) => {
                    const definition = {
                        id: `registry-discovery-read.${capability}.${binding}.${variant}`,
                        version: capability === "repository-info" ? 1 : 2,
                        fixture,
                        samples: 10,
                        obligations: [{ target: target.key, binding, variant }],
                        budget: budgetFor(target, variant),
                    };
                    return {
                        definition,
                        execute: (environment: QueryEnvironment) =>
                            executeRegistryRead(
                                inventory,
                                environment,
                                definition,
                                capability,
                                variant,
                                contexts,
                                fresh,
                            ),
                    };
                }),
            )
            .flat();
    });
}
