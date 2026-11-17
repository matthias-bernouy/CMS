import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { AUTHORING_ARTIFACTS } from "./fixture";
import { prepareAuthoring } from "./recipes";
import type { CapabilityInventory } from "../../capabilities/types";

export function authoringScenarios(inventory: CapabilityInventory, fixture: string) {
    const implementation = inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    return lifecycleScenarios(
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
}
