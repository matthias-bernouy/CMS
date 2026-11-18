import { lifecycleScenarios } from "../../lifecycle";
import { sampleCollectionResources } from "../resources/samples";
import { collectionUpgradeContext } from "./context";
import { prepareCollectionUpgrade } from "./execute";
import { prepareRecoveredCollectionRead } from "./recovery/read";
import { prepareCollectionRecovery } from "./recovery/cases";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { settingsTenants } from "../../content/settings/tenant";

/** Distinct per-sample release pairs keep sequential tenant reuse valid without an implicit downgrade. */
export function collectionUpgradeScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    return [
        "plan-collection-upgrade",
        "apply-collection-upgrade",
        "get-collection-upgrade",
        "resume-collection-upgrade",
    ].flatMap((capability) => {
        const resources = sampleCollectionResources(inventory);
        const variants: Variant[] = ["nominal", "cold", "warm", "concurrent"];
        if (["plan-collection-upgrade", "get-collection-upgrade"].includes(capability)) {
            variants.push("invalidation");
        }
        return lifecycleScenarios(
            inventory,
            fixture,
            "installation-collection-upgrades",
            "ulvia/cms.installations",
            [capability],
            async (environment, id, obligation, sampleIndex) => {
                const name = `${id}-${obligation.binding}-${obligation.variant}`;
                const source = await resources(environment, name, sampleIndex, "1.0.0");
                const target = await resources(environment, name, sampleIndex, "1.1.0");
                const context = await collectionUpgradeContext(
                    inventory,
                    await lease(environment),
                    environment,
                    obligation.binding,
                    source,
                    target,
                );
                if (id === "get-collection-upgrade" && obligation.variant === "invalidation") {
                    return prepareRecoveredCollectionRead(context, obligation.binding);
                }
                return id === "resume-collection-upgrade"
                    ? prepareCollectionRecovery(context, obligation.binding)
                    : prepareCollectionUpgrade(context, id, obligation.binding, obligation.variant);
            },
            variants,
        );
    });
}
