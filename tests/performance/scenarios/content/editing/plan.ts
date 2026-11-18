import { lifecycleScenarios } from "../../lifecycle";
import { scenarioClient } from "../../../harness/clients/session";
import { assertCondition } from "../../queries/types";
import { prepareComposition } from "./recipe";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";

export const COMPOSITION_EDITORS = [
    "site-blocs.read",
    "site-blocs.identity",
    "site-blocs.update",
    "site-blocs.delete",
] as const;

export function compositionScenarios(inventory: CapabilityInventory, fixture: string) {
    return COMPOSITION_EDITORS.flatMap((capability) => {
        const variants: readonly Variant[] = [
            "nominal",
            "cold",
            "warm",
            "concurrent",
            ...(["site-blocs.read", "site-blocs.identity"].includes(capability)
                ? ["large" as const, "history" as const, "invalidation" as const]
                : []),
        ];
        return lifecycleScenarios(
            inventory,
            fixture,
            "composition-editing",
            "ulvia/cms.content",
            [capability],
            async (environment, id, obligation) => {
                assertCondition(environment.isolationSite, "composition-isolation-fixture-missing");
                const isolated = await environment.isolationSite();
                return prepareComposition(
                    scenarioClient(inventory, environment.main),
                    scenarioClient(inventory, { ...environment.main, cookie: isolated.cookie }),
                    scenarioClient(inventory, isolated),
                    id,
                    obligation.binding,
                    obligation.variant,
                );
            },
            variants,
        );
    });
}
