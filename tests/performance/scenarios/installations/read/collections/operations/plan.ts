import { budgetFor } from "../../../../../capabilities/policies";
import { sampleScenario } from "../../../../../harness/execution/samples";
import { ClientFailure } from "../../../../../harness/clients/failure";
import { collectionReadContexts } from "../context";
import { operationReadContexts } from "./context";
import { prepareOperationIdentity } from "./identity";
import { prepareOperationRead } from "./recipe";
import { assertCondition } from "../../../../queries/types";
import type { CapabilityInventory, Variant } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";

export function operationReaderScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    collections = collectionReadContexts(inventory),
) {
    const contexts = operationReadContexts(collections);
    return ["list-operations", "get-operation"].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained &&
                row.release.contractId === "ulvia/cms.installations" &&
                row.definition.id === capability,
        );
        assertCondition(target, "operation-read-inventory-stale");
        return target.definition.bindings.flatMap(({ id: binding }) =>
            (capability === "get-operation"
                ? (["invalidation"] as readonly Variant[])
                : (["large", "history", "invalidation"] as readonly Variant[])
            ).map((variant) => {
                const definition = {
                    id: `installation-operation-read.${capability}.${binding}.${variant}`,
                    version: capability === "get-operation" ? 2 : 1,
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
                                (index) =>
                                    capability === "get-operation"
                                        ? prepareOperationIdentity(inventory, environment, context, binding, index)
                                        : prepareOperationRead(
                                              inventory,
                                              environment,
                                              context,
                                              binding,
                                              variant,
                                              index,
                                          ),
                            );
                        } catch (error) {
                            return {
                                scenario: definition.id,
                                status: "blocked" as const,
                                measurements: [],
                                failure: error instanceof ClientFailure ? error.code : "operation-read-preparation",
                            };
                        }
                    },
                };
            }),
        );
    });
}
