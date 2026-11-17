import { lifecycleScenarios } from "../lifecycle";
import { pageClient } from "./client";
import { PAGE_CAPABILITIES, preparePage } from "./recipes";
import type { CapabilityInventory } from "../../capabilities/types";

export function pageScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "pages",
        "ulvia/cms.content",
        PAGE_CAPABILITIES,
        async (environment, capability, obligation) =>
            preparePage(pageClient(inventory, environment), capability, obligation.binding),
    );
}
