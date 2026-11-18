import { lifecycleScenarios } from "../lifecycle";
import { scenarioClient } from "../../harness/clients/session";
import { ACCESS_LIFECYCLE } from "./fixture";
import { prepareAccess } from "./recipes";
import { settingsTenants } from "../content/settings/tenant";
import { OAUTH_CAPABILITIES } from "./oauth/fixture";
import { prepareOAuth } from "./oauth/cases";
import { oauthReadScenarios } from "./oauth/read/plan";
import { RECOVERY_CAPABILITIES } from "./recovery/fixture";
import { prepareRecovery } from "./recovery/cases";
import type { CapabilityInventory } from "../../capabilities/types";
import { accessReadContext } from "./advanced/context";
import { preparePatRead } from "./advanced/pats";
import { prepareAccountRead, prepareAccountList } from "./advanced/users";

export function accessScenarios(inventory: CapabilityInventory, fixture: string, lease = settingsTenants(inventory)) {
    const accounts = lifecycleScenarios(
        inventory,
        fixture,
        "access",
        "ulvia/cms.access",
        ACCESS_LIFECYCLE,
        async (environment, capability) =>
            prepareAccess(scenarioClient(inventory, environment.main), capability, environment.main.origin),
    );
    const oauth = lifecycleScenarios(
        inventory,
        fixture,
        "access-oauth",
        "ulvia/cms.access",
        OAUTH_CAPABILITIES,
        async (environment, capability) => prepareOAuth(await lease(environment), capability, environment),
    );
    const recovery = lifecycleScenarios(
        inventory,
        fixture,
        "access-recovery",
        "ulvia/cms.access",
        RECOVERY_CAPABILITIES,
        async (environment, capability) =>
            prepareRecovery(inventory, await lease(environment), environment, capability),
    );
    const pats = lifecycleScenarios(
        inventory,
        fixture,
        "access-pat-read",
        "ulvia/cms.access",
        ["list-personal-access-tokens"],
        (environment, _capability, obligation) =>
            preparePatRead(accessReadContext(inventory, environment), obligation.variant),
        ["large", "history", "invalidation"],
    );
    const members = lifecycleScenarios(
        inventory,
        fixture,
        "access-member-read",
        "ulvia/cms.access",
        ["list-users"],
        (environment, _capability, obligation) =>
            prepareAccountList(accessReadContext(inventory, environment), obligation.variant),
        ["large", "history"],
    );
    const invalidation = lifecycleScenarios(
        inventory,
        fixture,
        "access-member-read",
        "ulvia/cms.access",
        ["get-user", "list-users", "resolve-actor"],
        (environment, capability) =>
            prepareAccountRead(accessReadContext(inventory, environment), capability, environment.registry.cookie),
        ["invalidation"],
    );
    return [
        ...accounts,
        ...oauth,
        ...recovery,
        ...pats,
        ...members,
        ...invalidation,
        ...oauthReadScenarios(inventory, fixture),
    ];
}
