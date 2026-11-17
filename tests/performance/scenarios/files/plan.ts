import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { FILE_CAPABILITIES } from "./client";
import { prepareFile } from "./recipes";
import { cleanupNamespace } from "../../harness/docker/cleanup/namespace";
import type { CapabilityInventory } from "../../capabilities/types";

export function fileScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "files",
        "ulvia/cms.files",
        FILE_CAPABILITIES,
        async (environment, capability, obligation) =>
            prepareFile(
                scenarioClient(inventory, environment.main),
                capability,
                obligation.binding,
                environment.main.origin,
                (credentials, name) => cleanupNamespace(environment.stack, "files", credentials, name),
            ),
    );
}
