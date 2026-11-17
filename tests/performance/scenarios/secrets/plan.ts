import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { SECRET_CAPABILITIES } from "./fixture";
import { prepareSecret } from "./recipes";
import { cleanupNamespace } from "../../harness/docker/cleanup/namespace";
import type { CapabilityInventory } from "../../capabilities/types";

export function secretScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "secrets",
        "ulvia/cms.secrets",
        SECRET_CAPABILITIES,
        async (environment, capability) =>
            prepareSecret(scenarioClient(inventory, environment.main), capability, (credentials, name) =>
                cleanupNamespace(environment.stack, "secrets", credentials, name),
            ),
    );
}
