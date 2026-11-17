import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { ACCESS_LIFECYCLE } from "./fixture";
import { prepareAccess } from "./recipes";
import type { CapabilityInventory } from "../../capabilities/types";

export function accessScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "access",
        "ulvia/cms.access",
        ACCESS_LIFECYCLE,
        async (environment, capability) =>
            prepareAccess(scenarioClient(inventory, environment.main), capability, environment.main.origin),
    );
}
