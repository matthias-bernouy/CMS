import { formsScenarios } from "./forms/plan";
import { queryScenarios } from "./queries/plan";
import { pageScenarios } from "./pages/plan";
import { secretScenarios } from "./secrets/plan";
import { fileScenarios } from "./files/plan";
import { contentScenarios } from "./content/plan";
import { accessScenarios } from "./access/plan";
import { authoringScenarios } from "./authoring/plan";
import { initializationScenarios } from "./initialization/plan";
import { namespaceReadScenarios } from "./repository/namespace-read/plan";
import { repositoryScenarios } from "./repository/plan";
import { settingsTenants } from "./content/settings/tenant";
import { emailScenarios } from "./email/plan";
import { hostingScenarios } from "./hosting/plan";
import { hostingContexts } from "./hosting/context";
import { hostingTechnicalScenarios } from "./hosting/technical/plan";
import { readerScenarios } from "./readers/plan";
import { gatewayScenarios } from "./gateway/plan";
import { observabilityReadScenarios } from "./observability/plan";
import { clusterLogScenarios } from "./observability/cluster/plan";
import { installationScenarios } from "./installations/plan";
import { providerScenarios } from "./providers/plan";
import { executeQuery } from "./queries/execute";
import type { QueryEnvironment } from "./queries/execute";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../capabilities/types";

export type ExecutableScenario = Readonly<{
    definition: ScenarioDefinition;
    execute: (environment: QueryEnvironment) => Promise<ScenarioResult>;
}>;

export function assessmentScenarios(inventory: CapabilityInventory, fixture: string): ExecutableScenario[] {
    const tenants = settingsTenants(inventory);
    const hosting = hostingContexts(inventory);
    return [
        ...queryScenarios(inventory, fixture).map((scenario) => ({
            definition: scenario.definition,
            execute: (environment: QueryEnvironment) => executeQuery(scenario, environment),
        })),
        ...pageScenarios(inventory, fixture),
        ...secretScenarios(inventory, fixture),
        ...fileScenarios(inventory, fixture),
        ...contentScenarios(inventory, fixture, tenants),
        ...accessScenarios(inventory, fixture, tenants),
        ...authoringScenarios(inventory, fixture),
        ...initializationScenarios(inventory, fixture),
        ...repositoryScenarios(inventory, fixture),
        ...namespaceReadScenarios(inventory, fixture),
        ...emailScenarios(inventory, fixture, tenants),
        ...formsScenarios(inventory, fixture),
        ...hostingScenarios(inventory, fixture, hosting),
        ...hostingTechnicalScenarios(inventory, fixture, hosting),
        ...readerScenarios(inventory, fixture),
        ...gatewayScenarios(inventory, fixture),
        ...observabilityReadScenarios(inventory, fixture),
        ...clusterLogScenarios(inventory, fixture),
        ...installationScenarios(inventory, fixture, tenants),
        ...providerScenarios(inventory, fixture, tenants),
    ];
}
