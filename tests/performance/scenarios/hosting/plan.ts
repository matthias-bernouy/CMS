import { lifecycleScenarios } from "../lifecycle";
import { requiredVariants } from "../../capabilities/policies";
import { hostingContexts } from "./context";
import { prepareHostingInstance } from "./instances";
import { prepareHostingDomain } from "./domains";
import type { CapabilityInventory } from "../../capabilities/types";

const HOSTING_CAPABILITIES = [
    "instances.create",
    "instances.list",
    "instances.get",
    "instances.disable",
    "domains.claim",
    "domains.list",
    "domains.verify",
    "domains.disable",
    "zones.claim",
    "zones.list",
    "zones.verify",
    "zones.disable",
] as const;

export function hostingScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    contextFor = hostingContexts(inventory),
) {
    return HOSTING_CAPABILITIES.flatMap((capability) => {
        const target = inventory.targets.find(
            (target) =>
                !target.retained &&
                target.release.contractId === "ulvia/cms.hosting" &&
                target.definition.id === capability,
        );
        if (!target) {
            throw new Error("Hosting scenario inventory is stale");
        }
        return lifecycleScenarios(
            inventory,
            fixture,
            "hosting",
            "ulvia/cms.hosting",
            [capability],
            async (environment, id, obligation) => {
                const context = await contextFor(environment);
                return id.startsWith("instances.")
                    ? prepareHostingInstance(context, id, obligation.binding, obligation.variant)
                    : prepareHostingDomain(context, id, obligation.binding, obligation.variant);
            },
            requiredVariants(target),
        );
    });
}
