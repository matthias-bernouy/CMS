import { lifecycleScenarios } from "../lifecycle";
import { gatewayContext } from "./context";
import { prepareGatewayBasic } from "./basic";
import { prepareGatewayToken } from "./tokens";
import { prepareActorInspection } from "./actor";
import { prepareLogs } from "./logs";
import type { CapabilityInventory } from "../../capabilities/types";

const GATEWAY_CAPABILITIES = [
    "gateway.route.get",
    "gateway.identity.resolve",
    "gateway.audit.append",
    "gateway.invocation.issue",
    "gateway.dispatch.prepare",
] as const;

export function gatewayScenarios(inventory: CapabilityInventory, fixture: string) {
    const control = lifecycleScenarios(
        inventory,
        fixture,
        "gateway-control",
        "ulvia/cms.installations",
        GATEWAY_CAPABILITIES,
        async (environment, capability) => {
            const context = await gatewayContext(inventory, environment);
            return capability === "gateway.invocation.issue" || capability === "gateway.dispatch.prepare"
                ? prepareGatewayToken(context, capability)
                : prepareGatewayBasic(context, capability);
        },
    );
    const actors = lifecycleScenarios(
        inventory,
        fixture,
        "machine-access",
        "ulvia/cms.access",
        ["inspect-actor"],
        async (environment, _capability, obligation) =>
            prepareActorInspection(await gatewayContext(inventory, environment), obligation.variant),
        ["nominal", "cold", "warm", "concurrent", "invalidation"],
    );
    const logs = lifecycleScenarios(
        inventory,
        fixture,
        "machine-logs",
        "ulvia/cms.observability",
        ["logs.append", "logs.get"],
        async (environment, capability, obligation) =>
            prepareLogs(await gatewayContext(inventory, environment), capability, obligation.binding),
    );
    return [...control, ...actors, ...logs];
}
