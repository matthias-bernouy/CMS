import { lifecycleScenarios } from "../lifecycle";
import { pageClient } from "./client";
import { PAGE_CAPABILITIES, preparePage } from "./recipes";
import { pageScaleScenarios } from "./scale/plan";
import { pageReadScenarios } from "./read/plan";
import type { CapabilityInventory } from "../../capabilities/types";

export function pageScenarios(inventory: CapabilityInventory, fixture: string) {
    const baseline = lifecycleScenarios(
        inventory,
        fixture,
        "pages",
        "ulvia/cms.content",
        PAGE_CAPABILITIES,
        async (environment, capability, obligation) =>
            preparePage(pageClient(inventory, environment), capability, obligation.binding),
    );
    return [...baseline, ...pageScaleScenarios(inventory, fixture), ...pageReadScenarios(inventory, fixture)];
}
