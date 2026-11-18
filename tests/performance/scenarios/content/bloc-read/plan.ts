import { budgetFor } from "../../../capabilities/policies";
import { sampleScenario } from "../../../harness/execution/samples";
import { scenarioClient } from "../../../harness/clients/session";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import { blocReadDataset } from "./dataset";
import { prepareBlocRead } from "./recipe";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function blocReadScenarios(inventory: CapabilityInventory, fixture: string) {
    return ["pages.editor-catalogue", "site-blocs.list", "site-blocs.get"].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained && row.release.contractId === "ulvia/cms.content" && row.definition.id === capability,
        );
        if (!target) {
            throw Error("Bloc reader scenario inventory is stale");
        }
        const variants: readonly Variant[] =
            capability === "site-blocs.get" ? ["invalidation"] : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `bloc-read.lifecycle.${capability}.${binding}.${variant}`,
                    version: 1,
                    fixture,
                    obligations: [{ target: target.key, binding, variant }],
                    samples: 10,
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        runBlocRead(inventory, environment, definition, capability, binding, variant),
                };
            }),
        );
    });
}

async function runBlocRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<ScenarioResult> {
    const dataset = blocReadDataset(scenarioClient(inventory, environment.main));
    const foreign = scenarioClient(inventory, { ...environment.main, cookie: environment.registry.cookie });
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "bloc-read-preparation-failed",
        measurements: [],
    };
    try {
        await dataset.initialize(variant);
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            prepareBlocRead(dataset, capability, binding, variant, index, foreign, (tag, revision) =>
                expectBodyRefusal(
                    inventory,
                    environment.main,
                    "ulvia/cms.content",
                    "site-blocs.publish",
                    { tag, revision },
                    { tag, revision, unexpectedPerformanceField: true },
                    400,
                ),
            ),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "bloc-read-preparation-failed",
        };
    } finally {
        try {
            await dataset.close();
        } catch {
            result = { ...result, status: "blocked", failure: "bloc-read-cleanup-failed" };
        }
    }
    return result;
}
