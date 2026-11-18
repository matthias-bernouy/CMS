import { budgetFor } from "../../../../../../capabilities/policies";
import { sampleScenario } from "../../../../../../harness/execution/samples";
import { ClientFailure } from "../../../../../../harness/clients/failure";
import { collectionReadContexts } from "../../context";
import { usageReadContexts } from "./context";
import { prepareUsageRead } from "./recipe";
import { assertCondition } from "../../../../../queries/types";
import type { CapabilityInventory, Variant } from "../../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../../queries/execute";

export function usageReaderScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    collections = collectionReadContexts(inventory),
) {
    const contexts = usageReadContexts(inventory, collections);
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            row.definition.id === "list-site-usage",
    );
    assertCondition(target, "usage-read-inventory-stale");
    return target.definition.bindings.flatMap(({ id: binding }) =>
        (["large", "history", "invalidation"] as readonly Variant[]).map((variant) => {
            const definition = {
                id: `installation-usage-read.list-site-usage.${binding}.${variant}`,
                version: 1,
                fixture,
                samples: 10,
                obligations: [{ target: target.key, binding, variant }],
                budget: budgetFor(target, variant),
            };
            return {
                definition,
                async execute(environment: QueryEnvironment) {
                    try {
                        const context = await contexts(environment, variant);
                        return await sampleScenario(
                            environment.stack,
                            definition,
                            definition.obligations[0]!,
                            (index) => prepareUsageRead(inventory, environment, context, binding, variant, index),
                        );
                    } catch (error) {
                        return {
                            scenario: definition.id,
                            status: "blocked" as const,
                            measurements: [],
                            failure: error instanceof ClientFailure ? error.code : "usage-read-preparation",
                        };
                    }
                },
            };
        }),
    );
}
