import { budgetFor } from "../../../../capabilities/policies";
import { assertCondition } from "../../../queries/types";
import { collectionReadContexts } from "./context";
import { executeCollectionRead } from "./execute";
import type { CapabilityInventory, Variant } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

export function collectionReaderScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    contexts = collectionReadContexts(inventory),
) {
    return [
        "list-available-collections",
        "list-collection-catalogue",
        "list-collection-releases",
        "list-collection-installations",
        "list-installed-collections",
        "get-collection-details",
        "get-collection-installation",
        "get-collection-release",
    ].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained &&
                row.release.contractId === "ulvia/cms.installations" &&
                row.definition.id === capability,
        );
        assertCondition(target, "collection-read-inventory-stale");
        const variants: readonly Variant[] =
            capability === "get-collection-installation" || capability === "get-collection-release"
                ? ["invalidation"]
                : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `installation-collection-read.${capability}.${binding}.${variant}`,
                    version: 1,
                    fixture,
                    samples: 10,
                    obligations: [{ target: target.key, binding, variant }],
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        executeCollectionRead(inventory, environment, definition, capability, variant, contexts),
                };
            }),
        );
    });
}
