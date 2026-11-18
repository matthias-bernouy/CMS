import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { SECRET_CAPABILITIES } from "./fixture";
import { prepareSecret } from "./recipes";
import { cleanupNamespace } from "../../harness/docker/cleanup/namespace";
import { prepareSecretRead } from "./advanced/cases";
import { expectBodyRefusal } from "../../harness/clients/refusal";
import type { CapabilityInventory } from "../../capabilities/types";

export function secretScenarios(inventory: CapabilityInventory, fixture: string) {
    const baseline = lifecycleScenarios(
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
    const prepareAdvanced: Parameters<typeof lifecycleScenarios>[5] = (environment, capability, obligation) =>
        prepareSecretRead(
            scenarioClient(inventory, environment.main),
            capability,
            obligation.variant,
            (credentials, name) => cleanupNamespace(environment.stack, "secrets", credentials, name),
            (input) =>
                expectBodyRefusal(
                    inventory,
                    environment.main,
                    "ulvia/cms.secrets",
                    capability,
                    input,
                    { ...input, limit: 101 },
                    400,
                ),
        );
    const invalidation = lifecycleScenarios(
        inventory,
        fixture,
        "secrets-read",
        "ulvia/cms.secrets",
        ["namespace.get", "secrets.get-metadata", "secrets.get-metadata-by-name", "secrets.list", "secrets.resolve"],
        prepareAdvanced,
        ["invalidation"],
    );
    const volume = lifecycleScenarios(
        inventory,
        fixture,
        "secrets-read",
        "ulvia/cms.secrets",
        ["secrets.list"],
        prepareAdvanced,
        ["large", "history"],
    );
    return [...baseline, ...invalidation, ...volume];
}
