import { lifecycleScenarios } from "../../lifecycle";
import { prepareDomainRouting } from "./routing";
import { prepareTlsPermission } from "./tls";
import { hostingContexts } from "../context";
import type { CapabilityInventory } from "../../../capabilities/types";

export function hostingTechnicalScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    contextFor = hostingContexts(inventory),
) {
    return [
        ...lifecycleScenarios(
            inventory,
            fixture,
            "hosting-technical",
            "ulvia/provider.routing",
            ["domains.resolve"],
            async (environment, _capability, obligation) =>
                prepareDomainRouting(inventory, await contextFor(environment), obligation.variant),
            ["nominal", "cold", "warm", "concurrent", "invalidation"],
        ),
        ...lifecycleScenarios(
            inventory,
            fixture,
            "hosting-tls",
            "ulvia/provider.tls",
            ["certificates.permit"],
            async (environment, _capability, obligation) =>
                prepareTlsPermission(inventory, await contextFor(environment), obligation.variant),
            ["nominal", "cold", "warm", "concurrent", "invalidation"],
        ),
    ];
}
