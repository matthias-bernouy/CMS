import { requiredVariants } from "../../../capabilities/policies";
import type { CapabilityInventory } from "../../../capabilities/types";
import { lifecycleScenarios } from "../../lifecycle";
import { settingsTenants } from "../../content/settings/tenant";
import { prepareTemplate } from "./recipe";

export function emailTemplateScenarios(inventory: CapabilityInventory, fixture: string) {
    return inventory.targets
        .filter(
            (target) =>
                !target.retained &&
                (target.release.contractId === "ulvia/cms.email-templates" ||
                    (target.release.contractId === "ulvia/cms.access" &&
                        target.definition.id.endsWith("email-configuration"))),
        )
        .flatMap((target) => {
            // A bounded independent tenant pool per capability prevents immutable-history/capacity exhaustion between scenarios.
            const lease = settingsTenants(inventory);
            return lifecycleScenarios(
                inventory,
                fixture,
                "email-templates",
                target.release.contractId,
                [target.definition.id],
                async (environment, capability, obligation) =>
                    prepareTemplate(
                        await lease(environment),
                        target.release.contractId,
                        capability,
                        obligation.variant,
                        obligation.binding,
                    ),
                requiredVariants(target),
            );
        });
}
