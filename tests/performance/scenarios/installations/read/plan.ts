import { lifecycleScenarios } from "../../lifecycle";
import { prepareRepositorySettingsRead } from "./repository";
import { prepareProviderInvalidation } from "./provider";
import { providerPeers } from "../../providers/peer";
import { providerContext } from "../../providers/context";
import { freshTenants } from "../fresh";
import { workflowDatasets } from "../../initialization/actions/datasets";
import { prepareInitializationRead } from "./initialization";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { settingsTenants } from "../../content/settings/tenant";

export function installationReadScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    const peers = providerPeers(inventory);
    const fresh = freshTenants(inventory);
    const datasets = workflowDatasets(inventory);
    return [
        ...lifecycleScenarios(
            inventory,
            fixture,
            "installation-read",
            "ulvia/cms.installations",
            ["initialization.repository.get"],
            async (environment, _capability, obligation) =>
                prepareRepositorySettingsRead(await lease(environment), environment, obligation.binding),
            ["invalidation"],
        ),
        ...["get-provider-access", "get-provider-installation"].flatMap((id) =>
            lifecycleScenarios(
                inventory,
                fixture,
                "installation-read",
                "ulvia/cms.installations",
                [id],
                async (environment, capability) => {
                    const peer = await peers(environment);
                    const context = await providerContext(environment, await lease(environment), peer, "http");
                    return prepareProviderInvalidation(inventory, environment, context, capability);
                },
                ["invalidation"],
                id === "get-provider-access" ? 3 : 1,
            ),
        ),
        ...lifecycleScenarios(
            inventory,
            fixture,
            "installation-read",
            "ulvia/cms.installations",
            ["initialization.entry", "initialization.status"],
            async (environment, capability, obligation) => {
                const dataset = (await datasets(environment, "one"))[0]!;
                return prepareInitializationRead(
                    await fresh(environment, obligation.binding),
                    environment,
                    capability,
                    obligation.binding,
                    dataset,
                );
            },
            ["invalidation"],
        ),
    ];
}
