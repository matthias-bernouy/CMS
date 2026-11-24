import { budgetFor } from "../../../../capabilities/policies";
import { sampleScenario } from "../../../../harness/execution/samples";
import { ClientFailure } from "../../../../harness/clients/failure";
import { siteDiscoveryContexts } from "./context";
import { prepareSiteDiscovery } from "./recipe";
import { assertCondition } from "../../../queries/types";
import type { CapabilityInventory, Variant } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

export function siteDiscoveryScenarios(inventory: CapabilityInventory, fixture: string) {
    const contexts = siteDiscoveryContexts(inventory);
    return ["repository.search", "repository.get", "repository.artifacts.search", "repository.artifacts.get"].flatMap(
        (capability) => {
            const target = inventory.targets.find(
                (row) =>
                    !row.retained &&
                    row.release.contractId === "ulvia/cms.installations" &&
                    row.definition.id === capability,
            );
            assertCondition(target, "site-discovery-inventory-stale");
            const variants: readonly Variant[] = capability.endsWith(".get")
                ? ["invalidation"]
                : ["large", "history", "invalidation"];
            return target.definition.bindings.flatMap(({ id: binding }) =>
                variants.map((variant) => {
                    const definition = {
                        id: `installation-discovery-read.${capability}.${binding}.${variant}`,
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
                                const state = await contexts(environment, variant);
                                return await sampleScenario(
                                    environment.stack,
                                    definition,
                                    definition.obligations[0]!,
                                    (index) =>
                                        prepareSiteDiscovery(
                                            inventory,
                                            environment,
                                            state,
                                            capability,
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
                                    failure: error instanceof ClientFailure ? error.code : "site-discovery-preparation",
                                };
                            }
                        },
                    };
                }),
            );
        },
    );
}
