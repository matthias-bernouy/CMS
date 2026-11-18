import { budgetFor } from "../../capabilities/policies";
import { scenarioClient } from "../../harness/clients/session";
import { sampleScenario } from "../../harness/execution/samples";
import { expectBodyRefusal } from "../../harness/clients/refusal";
import { ClientFailure } from "../../harness/clients/failure";
import { gatewayContext } from "../gateway/context";
import { machineInvocation } from "../gateway/machine";
import { logReadDataset } from "./dataset";
import { prepareLogRead } from "./recipe";
import { assertCondition } from "../queries/types";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult, Variant } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

const CONTRACT = "ulvia/cms.observability";
export function observabilityReadScenarios(inventory: CapabilityInventory, fixture: string) {
    return ["logs.query", "logs.aggregate", "logs.get"].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === CONTRACT && row.definition.id === capability,
        );
        if (!target) {
            throw Error("Log reader scenario inventory is stale");
        }
        const variants: readonly Variant[] =
            capability === "logs.get" ? ["invalidation"] : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `observability-read.lifecycle.${capability}.${binding}.${variant}`,
                    version: 2,
                    fixture,
                    obligations: [{ target: target.key, binding, variant }],
                    samples: 10,
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        runLogRead(inventory, environment, definition, capability, binding, variant),
                };
            }),
        );
    });
}

async function runLogRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<ScenarioResult> {
    try {
        const context = await gatewayContext(inventory, environment);
        const client = scenarioClient(inventory, environment.main);
        const foreign = scenarioClient(inventory, { ...environment.main, cookie: environment.registry.cookie });
        assertCondition(environment.isolationSite, "log-read-isolation-site-missing");
        const other = scenarioClient(inventory, await environment.isolationSite());
        const admitted = await other(CONTRACT, "logs.aggregate", "http", { groupBy: "service" });
        assertCondition(
            admitted.observation.validated,
            `log-read-other-administrator-${admitted.observation.failure ?? admitted.observation.status}`,
        );
        const dataset = logReadDataset(
            {
                call: (id, selected, input, assert) => client(CONTRACT, id, selected, input, assert),
                append: async (entries) => (await machineInvocation(context, CONTRACT, "logs.append"))({ entries }),
            },
            environment.stack.instanceId,
        );
        await dataset.initialize(variant);
        return await sampleScenario(environment.stack, definition, definition.obligations[0]!, () =>
            prepareLogRead(
                dataset,
                capability,
                binding,
                variant,
                (id, selected, input) => foreign(CONTRACT, id, selected, input),
                (id, selected, input) => other(CONTRACT, id, selected, input),
                (input) =>
                    expectBodyRefusal(
                        inventory,
                        environment.main,
                        CONTRACT,
                        capability,
                        input,
                        { ...input, unexpectedPerformanceField: true },
                        400,
                    ),
            ),
        );
    } catch (error) {
        return {
            scenario: definition.id,
            status: "blocked",
            measurements: [],
            failure: error instanceof ClientFailure ? error.code : "log-read-preparation-failed",
        };
    }
}
