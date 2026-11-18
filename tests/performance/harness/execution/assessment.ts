import type { ScenarioDefinition, ScenarioResult } from "../../capabilities/types";

type Scenario<Environment> = Readonly<{
    definition: ScenarioDefinition;
    execute: (environment: Environment) => Promise<ScenarioResult>;
}>;

/** A broken family fixture must not prevent unrelated capabilities from being attempted. */
export async function executeScenarios<Environment>(
    scenarios: readonly Scenario<Environment>[],
    environment: Environment,
    record: (result: ScenarioResult) => void | Promise<void>,
    prepare?: (definition: ScenarioDefinition) => Promise<void>,
) {
    for (const scenario of scenarios) {
        let result: ScenarioResult;
        try {
            await prepare?.(scenario.definition);
            result = await scenario.execute(environment);
        } catch {
            result = {
                scenario: scenario.definition.id,
                status: "blocked",
                failure: "Scenario fixture failed before returning a result",
                measurements: [],
            };
        }
        await record(result);
    }
}
