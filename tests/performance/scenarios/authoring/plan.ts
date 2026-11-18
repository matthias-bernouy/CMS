import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { AUTHORING_ARTIFACTS } from "./fixture";
import { prepareAuthoring } from "./recipes";
import { prepareConnection, prepareConnectionRead } from "./connection";
import { withClaimPublisher } from "./ownership";
import { authoringReadScenarios } from "./read/plan";
import type { CapabilityInventory } from "../../capabilities/types";

export function authoringScenarios(inventory: CapabilityInventory, fixture: string) {
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const artifacts = lifecycleScenarios(
        inventory,
        fixture,
        "authoring",
        "ulvia/cms.authoring",
        AUTHORING_ARTIFACTS,
        async (environment, capability, obligation) =>
            prepareAuthoring(
                scenarioClient(inventory, environment.main),
                capability,
                obligation.binding,
                implementation,
                environment.registry.origin,
            ),
    );
    const connections = lifecycleScenarios(
        inventory,
        fixture,
        "authoring-connection",
        "ulvia/cms.authoring",
        ["configure-connection", "disconnect-connection"],
        (environment, capability, obligation) =>
            prepareConnection(scenarioClient(inventory, environment.main), environment, capability, obligation.binding),
    );
    const readers = lifecycleScenarios(
        inventory,
        fixture,
        "authoring-connection-read",
        "ulvia/cms.authoring",
        ["get-connection"],
        (environment, _capability, obligation) =>
            prepareConnectionRead(scenarioClient(inventory, environment.main), environment, obligation.binding),
        ["invalidation"],
    );
    return [
        ...artifacts.map((scenario) =>
            scenario.definition.id.includes(".claim-namespace.")
                ? {
                      ...scenario,
                      definition: { ...scenario.definition, version: 2 },
                      execute: (environment: Parameters<typeof scenario.execute>[0]) =>
                          withClaimPublisher(inventory, environment, scenario.definition.id, scenario.execute),
                  }
                : scenario,
        ),
        ...connections,
        ...readers,
        ...authoringReadScenarios(inventory, fixture),
    ];
}
