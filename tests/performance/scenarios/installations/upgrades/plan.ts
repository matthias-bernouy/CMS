import { lifecycleScenarios } from "../../lifecycle";
import { upgradeContext, INSTALLATIONS } from "./context";
import { prepareContractSwitch } from "./contracts";
import { prepareUpgradeRead } from "./queries";
import { prepareRecoveredContractRead } from "./recovery/read";
import { prepareContractRecovery } from "./recovery/cases";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { settingsTenants } from "../../content/settings/tenant";

export function contractUpgradeScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    return [
        "plan-contract-upgrade",
        "apply-contract-upgrade",
        "get-contract-upgrade",
        "get-operation",
        "resume-contract-upgrade",
        "get-site-upgrade-status",
    ].flatMap((capability) => {
        const variants: Variant[] =
            capability === "get-site-upgrade-status" ? ["invalidation"] : ["nominal", "cold", "warm", "concurrent"];
        if (["plan-contract-upgrade", "get-contract-upgrade"].includes(capability)) {
            variants.push("invalidation");
        }
        return lifecycleScenarios(
            inventory,
            fixture,
            "installation-contract-upgrades",
            INSTALLATIONS,
            [capability],
            async (environment, id, obligation) => {
                const invalidatingReader =
                    obligation.variant === "invalidation" &&
                    ["get-contract-upgrade", "get-site-upgrade-status"].includes(id);
                const context = await upgradeContext(
                    inventory,
                    await lease(environment),
                    environment,
                    obligation.binding,
                    invalidatingReader ? { contractId: "ulvia/cms.content", capabilityId: "site.get" } : undefined,
                );
                if (invalidatingReader) {
                    return prepareRecoveredContractRead(context, id, obligation.binding);
                }
                if (id === "resume-contract-upgrade") {
                    return prepareContractRecovery(context, obligation.binding);
                }
                return id === "plan-contract-upgrade" || id === "apply-contract-upgrade"
                    ? prepareContractSwitch(context, id, obligation.binding, obligation.variant)
                    : prepareUpgradeRead(context, id, obligation.binding);
            },
            variants,
        );
    });
}
