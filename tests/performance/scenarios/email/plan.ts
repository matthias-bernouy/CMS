import { lifecycleScenarios } from "../lifecycle";
import { prepareSmtpConfiguration } from "./smtp/configuration";
import { prepareEmailDelivery } from "./smtp/delivery";
import { prepareSmtpInvalidation } from "./smtp/invalidation";
import type { settingsTenants } from "../content/settings/tenant";
import type { CapabilityInventory } from "../../capabilities/types";

export function emailScenarios(
    inventory: CapabilityInventory,
    fixture: string,
    lease: ReturnType<typeof settingsTenants>,
) {
    const configuration = lifecycleScenarios(
        inventory,
        fixture,
        "email-configuration",
        "ulvia/cms.emailer.smtp",
        ["smtp.configuration.update"],
        async (environment) => prepareSmtpConfiguration(await lease(environment), environment),
    );
    const delivery = lifecycleScenarios(
        inventory,
        fixture,
        "email-delivery",
        "ulvia/cms.emailer.smtp",
        ["emailer.send"],
        async (environment, _capability, obligation) =>
            prepareEmailDelivery(await lease(environment), environment, obligation.variant),
        ["nominal", "cold", "warm", "concurrent", "large"],
    );
    const invalidation = lifecycleScenarios(
        inventory,
        fixture,
        "email-configuration-read",
        "ulvia/cms.emailer.smtp",
        ["smtp.configuration.get"],
        async (environment) => prepareSmtpInvalidation(await lease(environment), environment),
        ["invalidation"],
    );
    return [...configuration, ...delivery, ...invalidation];
}
