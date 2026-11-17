import { budgetFor, loadPolicy } from "../capabilities/policies";
import { sampleScenario } from "../harness/execution/samples";
import type { PreparedSample } from "../harness/execution/samples";
import type { CapabilityInventory, Obligation, Variant } from "../capabilities/types";
import type { QueryEnvironment } from "./queries/execute";

/** Share execution mechanics; each family still supplies its explicit input and business postconditions. */
export function lifecycleScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    family: string,
    contractId: string,
    capabilities: readonly string[],
    prepare: (environment: QueryEnvironment, capability: string, obligation: Obligation) => Promise<PreparedSample>,
    variants: readonly Variant[] = ["nominal", "cold", "warm", "concurrent"],
) {
    return capabilities.flatMap((capability) => {
        const target = inventory.targets.find(
            (entry) => !entry.retained && entry.release.contractId === contractId && entry.definition.id === capability,
        );
        if (!target) {
            throw new Error(`${family} scenario inventory is stale`);
        }
        return target.definition.bindings.flatMap(({ id }) =>
            variants.map((variant) => {
                const obligation = { target: target.key, binding: id, variant };
                const definition = {
                    id: `${family}.lifecycle.${capability}.${id}.${variant}`,
                    version: 1,
                    fixture,
                    obligations: [obligation],
                    budget: budgetFor(target, variant),
                    samples: variant === "cold" ? 3 : 10,
                    ...loadPolicy(variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        sampleScenario(environment.stack, definition, obligation, async () => {
                            const sample = await prepare(environment, capability, obligation);
                            return {
                                ...sample,
                                send: async () => {
                                    if (variant === "cold") {
                                        await environment.stack.restartProvider();
                                    }
                                    return sample.send();
                                },
                            };
                        }),
                };
            }),
        );
    });
}
