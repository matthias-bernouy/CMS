import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { prepareSiteBloc, SITE_BLOC_CAPABILITIES } from "./site-blocs";
import { prepareDelivery } from "./delivery";
import { settingsTenants } from "./settings/tenant";
import { prepareSettings, SETTINGS_CAPABILITIES } from "./settings/recipes";
import { prepareSettingsRead, SETTINGS_READERS } from "./settings/read/recipe";
import { blocReadScenarios } from "./bloc-read/plan";
import { exampleReadScenarios } from "./examples/plan";
import type { CapabilityInventory } from "../../capabilities/types";

export function contentScenarios(inventory: CapabilityInventory, fixture: string, lease = settingsTenants(inventory)) {
    const blocs = lifecycleScenarios(
        inventory,
        fixture,
        "site-blocs",
        "ulvia/cms.content",
        SITE_BLOC_CAPABILITIES,
        async (environment, capability, obligation) =>
            prepareSiteBloc(scenarioClient(inventory, environment.main), capability, obligation.binding),
    );
    const delivery = (["GET", "HEAD"] as const).flatMap((method) =>
        lifecycleScenarios(
            inventory,
            fixture,
            `delivery-${method.toLowerCase()}`,
            "ulvia/cms.content",
            ["delivery.resolve-resource"],
            (environment, _capability, obligation) =>
                prepareDelivery(
                    scenarioClient(inventory, environment.main),
                    obligation.binding,
                    obligation.variant,
                    method,
                ),
            method === "GET"
                ? ["nominal", "cold", "warm", "large", "history", "concurrent", "invalidation"]
                : ["nominal", "cold", "warm", "concurrent", "invalidation"],
        ),
    );
    const settings = lifecycleScenarios(
        inventory,
        fixture,
        "content-settings",
        "ulvia/cms.content",
        SETTINGS_CAPABILITIES,
        async (environment, capability, obligation) =>
            prepareSettings(await lease(environment), environment, capability, obligation.binding),
    );
    const readers = lifecycleScenarios(
        inventory,
        fixture,
        "content-settings-read",
        "ulvia/cms.content",
        SETTINGS_READERS,
        async (environment, capability, obligation) =>
            prepareSettingsRead(await lease(environment), environment, capability, obligation.binding),
        ["invalidation"],
    );
    return [
        ...blocs,
        ...delivery,
        ...settings,
        ...readers,
        ...blocReadScenarios(inventory, fixture),
        ...exampleReadScenarios(inventory, fixture),
    ];
}
