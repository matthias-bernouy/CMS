import { lifecycleScenarios } from "../lifecycle";
import { providerPeers } from "./peer";
import { providerContext, INSTALLATIONS } from "./context";
import { prepareManifestImport } from "./import";
import { prepareConnection } from "./connection";
import { preparePairing } from "./pairing";
import { prepareTechnicalConnection } from "./technical/configure";
import { gatewayProviderContext } from "../gateway/providers/context";
import { prepareProviderAuthority } from "../gateway/providers/authorization";
import { prepareProviderDispatch } from "../gateway/providers/preparation";
import { delegationContext } from "../gateway/delegation/context";
import { prepareDelegation } from "../gateway/delegation/cases";
import type { CapabilityInventory } from "../../capabilities/types";
import type { settingsTenants } from "../content/settings/tenant";

export function providerScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    const peers = providerPeers(inventory);
    const administration = lifecycleScenarios(
        inventory,
        fixture,
        "provider-administration",
        INSTALLATIONS,
        [
            "import-provider-manifest",
            "preview-provider-connection",
            "approve-provider-connection",
            "pair-provider-connection",
            "set-provider-status",
        ],
        async (environment, capability, obligation) => {
            const peer = await peers(environment);
            const context = await providerContext(environment, await lease(environment), peer, obligation.binding);
            if (capability === "import-provider-manifest") {
                return prepareManifestImport(context, obligation.binding);
            }
            return capability === "preview-provider-connection" || capability === "approve-provider-connection"
                ? prepareConnection(context, capability, obligation.binding)
                : preparePairing(context, capability, obligation.binding);
        },
    );
    const connections = lifecycleScenarios(
        inventory,
        fixture,
        "provider-technical",
        "ulvia/provider.connections",
        ["connections.configure"],
        async (environment) => prepareTechnicalConnection(inventory, environment, await peers(environment)),
    );
    const authority = ["gateway.provider.resolve", "gateway.provider.authorize", "gateway.provider.prepare"].flatMap(
        (capability) =>
            lifecycleScenarios(
                inventory,
                fixture,
                "gateway-provider",
                INSTALLATIONS,
                [capability],
                async (environment, id, obligation) => {
                    const peer = await peers(environment);
                    const context = await gatewayProviderContext(
                        inventory,
                        environment,
                        await lease(environment),
                        peer,
                    );
                    return id === "gateway.provider.prepare"
                        ? prepareProviderDispatch(context)
                        : prepareProviderAuthority(context, id, obligation.variant);
                },
                capability === "gateway.provider.authorize"
                    ? ["nominal", "cold", "warm", "concurrent", "invalidation"]
                    : ["nominal", "cold", "warm", "concurrent"],
            ),
    );
    const delegations = lifecycleScenarios(
        inventory,
        fixture,
        "gateway-delegation",
        INSTALLATIONS,
        ["gateway.delegation.issue", "gateway.delegation.check", "gateway.delegation.close"],
        async (environment, capability) => {
            const peer = await peers(environment);
            const context = await gatewayProviderContext(inventory, environment, await lease(environment), peer);
            try {
                return await prepareDelegation(await delegationContext(context), capability);
            } catch (error) {
                await context.close();
                throw error;
            }
        },
    );
    const invalidation = lifecycleScenarios(
        inventory,
        fixture,
        "gateway-delegation",
        INSTALLATIONS,
        ["gateway.delegation.check"],
        async (environment, capability) => {
            const peer = await peers(environment);
            const context = await gatewayProviderContext(inventory, environment, await lease(environment), peer);
            try {
                return await prepareDelegation(await delegationContext(context), capability, true);
            } catch (error) {
                await context.close();
                throw error;
            }
        },
        ["invalidation"],
    );
    return [...administration, ...connections, ...authority, ...delegations, ...invalidation];
}
