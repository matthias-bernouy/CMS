import { lifecycleScenarios } from "../../lifecycle";
import { pageClient } from "../client";
import { PAGE_CAPABILITIES, preparePage } from "../recipes";
import { pageScaleDataset } from "./dataset";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import type { CapabilityInventory, ScenarioResult } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function pageScaleScenarios(inventory: CapabilityInventory, fixture: string) {
    const mutationCases = lifecycleScenarios(
        inventory,
        fixture,
        "pages-scale",
        "ulvia/cms.content",
        PAGE_CAPABILITIES,
        (environment, capability, obligation) =>
            preparePage(pageClient(inventory, environment), capability, obligation.binding, {
                history: obligation.variant === "history" ? 16 : 0,
                contentBytes: obligation.variant === "large" ? 256 * 1024 : 0,
                foreign: pageClient(inventory, {
                    ...environment,
                    main: { ...environment.main, cookie: environment.registry.cookie },
                }),
                ...(capability !== "pages.get"
                    ? {
                          invalid: (input: Readonly<Record<string, unknown>>) =>
                              expectBodyRefusal(
                                  inventory,
                                  environment.main,
                                  "ulvia/cms.content",
                                  capability,
                                  input,
                                  { ...input, unexpectedPerformanceField: true },
                                  400,
                              ),
                      }
                    : {}),
            }),
        ["large", "history"],
    );
    const invalidation = lifecycleScenarios(
        inventory,
        fixture,
        "pages-scale",
        "ulvia/cms.content",
        ["pages.get"],
        (environment, capability, obligation) =>
            preparePage(pageClient(inventory, environment), capability, obligation.binding, {
                invalidate: true,
                foreign: pageClient(inventory, {
                    ...environment,
                    main: { ...environment.main, cookie: environment.registry.cookie },
                }),
            }),
        ["invalidation"],
    );
    return [
        ...mutationCases.map((scenario) => ({
            ...scenario,
            definition: scenario.definition.id.includes(".pages.rename.")
                ? { ...scenario.definition, version: 2 }
                : scenario.definition,
            execute: (environment: QueryEnvironment) =>
                withPageScaleDataset(
                    inventory,
                    environment,
                    scenario.definition.id,
                    scenario.definition.obligations[0]!.variant === "history",
                    () => scenario.execute(environment),
                ),
        })),
        ...invalidation,
    ];
}

async function withPageScaleDataset(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    id: string,
    history: boolean,
    execute: () => Promise<ScenarioResult>,
) {
    const dataset = pageScaleDataset(pageClient(inventory, environment), environment.main.origin);
    let result: ScenarioResult = {
        scenario: id,
        status: "blocked",
        failure: "page-scale-preparation-failed",
        measurements: [],
    };
    try {
        await dataset.initialize(history);
        result = await execute();
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "page-scale-preparation-failed",
        };
    } finally {
        try {
            await dataset.close();
        } catch {
            result = { ...result, status: "blocked", failure: "page-scale-cleanup-failed" };
        }
    }
    return result;
}
