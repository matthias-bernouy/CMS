import { ClientFailure } from "../../../harness/clients/failure";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { sampleScenario } from "../../../harness/execution/samples";
import { prepareDiscoveryRead } from "./metadata/recipe";
import { backgroundRecipes } from "./discovery/background";
import { prepareRecipeRead } from "./discovery/recipe";
import { prepareRegistryIdentity } from "./system/identity";
import { buildIsolation, prepareBuildRead } from "./system/build";
import type { registryReadContexts } from "./context";
import type { freshTenants } from "../../installations/fresh";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export async function executeRegistryRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    profile: string,
    contexts: ReturnType<typeof registryReadContexts>,
    fresh: ReturnType<typeof freshTenants>,
): Promise<ScenarioResult> {
    let isolation: Awaited<ReturnType<typeof buildIsolation>> | undefined;
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "registry-read-preparation",
        measurements: [],
    };
    try {
        if (capability === "repository-info") {
            result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, () =>
                prepareRegistryIdentity(inventory, environment, fresh),
            );
        } else if (capability === "publication-build-status") {
            isolation = await buildIsolation(inventory, environment, fresh);
            const selected = isolation;
            result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, () =>
                prepareBuildRead(inventory, environment, selected, (input, session) =>
                    expectBodyRefusal(
                        inventory,
                        session,
                        "ulvia/repository",
                        capability,
                        input,
                        { ...input, unexpectedPerformanceField: true },
                        400,
                    ),
                ),
            );
        } else {
            const recipes = capability === "bootstrap-recipes";
            const context = await contexts(environment, profile, recipes);
            const background = recipes ? await backgroundRecipes(context.read, context.state.scope.namespace) : [];
            const invalid = (input: Readonly<Record<string, unknown>>) =>
                expectBodyRefusal(
                    inventory,
                    { origin: environment.registry.origin, cookie: "" },
                    "ulvia/repository",
                    capability,
                    input,
                    { ...input, unexpectedPerformanceField: true },
                    400,
                );
            result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
                recipes
                    ? prepareRecipeRead(context, background, index, invalid)
                    : prepareDiscoveryRead(context, capability, profile, index, invalid),
            );
        }
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "registry-read-preparation",
        };
    } finally {
        try {
            await isolation?.close?.();
        } catch {
            result = { ...result, status: "blocked", failure: "registry-read-isolation-cleanup" };
        }
    }
    return result;
}
