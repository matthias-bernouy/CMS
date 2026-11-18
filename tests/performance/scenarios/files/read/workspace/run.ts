import { scenarioClient } from "../../../../harness/clients/session";
import { expectBodyRefusal } from "../../../../harness/clients/refusal";
import { ClientFailure } from "../../../../harness/clients/failure";
import { sampleScenario } from "../../../../harness/execution/samples";
import { assertCondition } from "../../../queries/types";
import { fileCalls } from "../../client";
import { workspaceReadState } from "./state";
import { prepareWorkspaceRead } from "./recipe";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";

export async function runWorkspaceRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    binding: string,
): Promise<ScenarioResult> {
    const state = workspaceReadState(fileCalls(scenarioClient(inventory, environment.main)));
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "workspace-reader-preparation",
        measurements: [],
    };
    try {
        assertCondition(environment.isolationSite, "workspace-isolation-site-missing");
        const other = fileCalls(scenarioClient(inventory, await environment.isolationSite()));
        const foreign = fileCalls(
            scenarioClient(inventory, { ...environment.main, cookie: environment.registry.cookie }),
        );
        await state.initialize();
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            prepareWorkspaceRead(state, binding, index, other, foreign, (input) =>
                expectBodyRefusal(
                    inventory,
                    environment.main,
                    "ulvia/cms.files",
                    "workspace.files.update",
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
            failure: error instanceof ClientFailure ? error.code : "workspace-reader-preparation",
        };
    } finally {
        try {
            await state.close();
        } catch {
            result = { ...result, status: "blocked", failure: "workspace-reader-cleanup" };
        }
    }
    return result;
}
