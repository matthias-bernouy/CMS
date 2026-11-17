import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { prepareSiteBloc, SITE_BLOC_CAPABILITIES } from "./site-blocs";
import type { CapabilityInventory } from "../../capabilities/types";

export function contentScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "site-blocs",
        "ulvia/cms.content",
        SITE_BLOC_CAPABILITIES,
        async (environment, capability, obligation) =>
            prepareSiteBloc(scenarioClient(inventory, environment.main), capability, obligation.binding),
    );
}
