import { budgetFor } from "../../../capabilities/policies";
import { sampleScenario } from "../../../harness/execution/samples";
import { pageClient } from "../client";
import { pageReadDataset } from "./dataset";
import { preparePageList } from "./recipe";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function pageReadScenarios(inventory: CapabilityInventory, fixture: string) {
    const target = inventory.targets.find(
        (row) => row.release.contractId === "ulvia/cms.content" && row.definition.id === "pages.list" && !row.retained,
    );
    if (!target) {
        throw Error("Page list scenario inventory is stale");
    }
    return target.definition.bindings.flatMap(({ id: binding }) =>
        (["large", "history", "invalidation"] as const).map((variant) => {
            const id = `pages-read.lifecycle.pages.list.${binding}.${variant}`;
            const definition = {
                id,
                version: 1,
                fixture,
                obligations: [{ target: target.key, binding, variant }],
                budget: budgetFor(target, variant),
                samples: 10,
            };
            return {
                definition,
                execute: (environment: QueryEnvironment) =>
                    runPageList(inventory, environment, definition, binding, variant),
            };
        }),
    );
}

async function runPageList(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    binding: string,
    variant: Variant,
): Promise<ScenarioResult> {
    const client = pageClient(inventory, environment);
    const dataset = pageReadDataset(client, environment.main.origin);
    const foreign = pageClient(inventory, {
        ...environment,
        main: { ...environment.main, cookie: environment.registry.cookie },
    });
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "page-list-preparation-failed",
        measurements: [],
    };
    try {
        await dataset.initialize(variant);
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            preparePageList(client, dataset, binding, variant, index, foreign, (input) =>
                expectBodyRefusal(
                    inventory,
                    environment.main,
                    "ulvia/cms.content",
                    "pages.list",
                    input,
                    { ...input, limit: 0 },
                    400,
                ),
            ),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "page-list-preparation-failed",
        };
    } finally {
        try {
            await dataset.close();
        } catch {
            result = { ...result, status: "blocked", failure: "page-list-cleanup-failed" };
        }
    }
    return result;
}
