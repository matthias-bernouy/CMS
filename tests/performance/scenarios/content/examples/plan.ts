import { budgetFor } from "../../../capabilities/policies";
import { sampleScenario } from "../../../harness/execution/samples";
import { scenarioClient } from "../../../harness/clients/session";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import { freshTenants } from "../../installations/fresh";
import { assertCondition } from "../../queries/types";
import { exampleResources } from "./resource/publish";
import { exampleTenant } from "./tenant";
import { exampleReadState } from "./state";
import { prepareExampleRead } from "./recipe";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { ExampleTenant } from "./tenant";
import type { ExampleProfile } from "./resource/publish";

export function exampleReadScenarios(inventory: CapabilityInventory, fixture: string) {
    const resources = exampleResources(inventory);
    const fresh = freshTenants(inventory);
    return ["examples.list", "examples.get"].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained && row.release.contractId === "ulvia/cms.content" && row.definition.id === capability,
        );
        assertCondition(target, "example-scenario-inventory-stale");
        const variants: readonly Variant[] =
            capability === "examples.get" ? ["invalidation"] : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `examples-read.lifecycle.${capability}.${binding}.${variant}`,
                    version: 1,
                    fixture,
                    obligations: [{ target: target.key, binding, variant }],
                    samples: 10,
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        runExampleRead(
                            inventory,
                            environment,
                            definition,
                            capability,
                            binding,
                            variant as ExampleProfile,
                            fresh,
                            resources,
                        ),
                };
            }),
        );
    });
}

async function runExampleRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    binding: string,
    profile: ExampleProfile,
    fresh: ReturnType<typeof freshTenants>,
    resources: ReturnType<typeof exampleResources>,
): Promise<ScenarioResult> {
    let tenant: ExampleTenant | undefined;
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "example-preparation-failed",
        measurements: [],
    };
    try {
        tenant = await exampleTenant(inventory, environment, binding, fresh);
        const state = exampleReadState(tenant, profile, (selected, patch) => resources(environment, selected, patch));
        await state.initialize();
        assertCondition(environment.isolationSite, "example-isolation-site-missing");
        const other = scenarioClient(inventory, await environment.isolationSite());
        const selected = tenant;
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            prepareExampleRead(
                state,
                capability,
                binding,
                profile === "invalidation",
                index,
                other,
                environment.main.cookie,
                (input) =>
                    expectBodyRefusal(
                        inventory,
                        selected.session,
                        "ulvia/cms.content",
                        capability,
                        input,
                        { ...input, unexpectedPerformanceField: true },
                        400,
                    ),
            ),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "example-preparation-failed",
        };
    } finally {
        try {
            await tenant?.close();
        } catch {
            result = { ...result, status: "blocked", failure: "example-tenant-cleanup-failed" };
        }
    }
    return result;
}
