import { lifecycleScenarios } from "../../lifecycle";
import { requiredVariants } from "../../../capabilities/policies";
import { assertCondition } from "../../queries/types";
import { workflowDatasets } from "./datasets";
import { prepareInitializationApply } from "./apply";
import { prepareInitializationList } from "./list";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { freshTenants } from "../../installations/fresh";

export function initializationActions(
    inventory: CapabilityInventory,
    fixture: string,
    fresh: ReturnType<typeof freshTenants>,
) {
    const datasets = workflowDatasets(inventory);
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            row.definition.id === "initialization.list",
    );
    assertCondition(target);
    const listing = lifecycleScenarios(
        inventory,
        fixture,
        "initialization-actions",
        "ulvia/cms.installations",
        ["initialization.list"],
        async (environment, _capability, obligation) =>
            prepareInitializationList(
                await fresh(environment, obligation.binding),
                environment,
                obligation.binding,
                obligation.variant,
                datasets,
            ),
        requiredVariants(target),
    );
    const applying = lifecycleScenarios(
        inventory,
        fixture,
        "initialization-actions",
        "ulvia/cms.installations",
        ["initialization.apply"],
        async (environment, _capability, obligation) => {
            const dataset = (await datasets(environment, obligation.variant === "large" ? "25-pages" : "one"))[0]!;
            return prepareInitializationApply(
                await fresh(environment, obligation.binding),
                environment,
                obligation.binding,
                obligation.variant,
                dataset,
            );
        },
        ["nominal", "cold", "warm", "concurrent", "large"],
    );
    return [...listing, ...applying];
}
