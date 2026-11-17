import { queryScenarios } from "./queries/plan";
import { pageScenarios } from "./pages/plan";
import { secretScenarios } from "./secrets/plan";
import { fileScenarios } from "./files/plan";
import { contentScenarios } from "./content/plan";
import { accessScenarios } from "./access/plan";
import { authoringScenarios } from "./authoring/plan";
import { initializationScenarios } from "./initialization/plan";
import { executeQuery } from "./queries/execute";
import type { QueryEnvironment } from "./queries/execute";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../capabilities/types";

export type ExecutableScenario = Readonly<{
    definition: ScenarioDefinition;
    execute: (environment: QueryEnvironment) => Promise<ScenarioResult>;
}>;

export function assessmentScenarios(inventory: CapabilityInventory, fixture: string): ExecutableScenario[] {
    return [
        ...queryScenarios(inventory, fixture).map((scenario) => ({
            definition: scenario.definition,
            execute: (environment: QueryEnvironment) => executeQuery(scenario, environment),
        })),
        ...pageScenarios(inventory, fixture),
        ...secretScenarios(inventory, fixture),
        ...fileScenarios(inventory, fixture),
        ...contentScenarios(inventory, fixture),
        ...accessScenarios(inventory, fixture),
        ...authoringScenarios(inventory, fixture),
        ...initializationScenarios(inventory, fixture),
    ];
}
