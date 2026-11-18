import { scenarioClient } from "../../../harness/clients/session";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { sampleScenario } from "../../../harness/execution/samples";
import { ClientFailure } from "../../../harness/clients/failure";
import { sourceReadState } from "./sources/state";
import { prepareSourceRead } from "./sources/recipe";
import { preparePublicationRead } from "./operations/recipe";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { AuthoredKind } from "../../../fixtures/authored";
import type { AuthoringReadContext } from "./context";

export async function executeAuthoringRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    context: AuthoringReadContext,
    implementation: ContractParentReference,
    capability: string,
    binding: string,
    profile: string,
    kinds: readonly AuthoredKind[],
): Promise<ScenarioResult> {
    const state = sourceReadState(
        context.main,
        context.namespace,
        implementation,
        kinds,
        capability === "get-source-snapshot",
    );
    const client = scenarioClient(inventory, environment.main);
    const foreign = scenarioClient(inventory, { ...environment.main, cookie: environment.registry.cookie });
    const invalid = (input: Readonly<Record<string, unknown>>) =>
        expectBodyRefusal(
            inventory,
            environment.main,
            "ulvia/cms.authoring",
            capability,
            input,
            { ...input, unexpectedPerformanceField: true },
            400,
        );
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "source-reader-preparation",
        measurements: [],
    };
    try {
        await context.initialize();
        await state.initialize(profile);
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            capability === "get-publication-operation"
                ? preparePublicationRead(state, context, client, binding, index, foreign, invalid)
                : prepareSourceRead(state, context, capability, binding, profile, index, kinds, foreign, invalid),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "source-reader-preparation",
        };
    } finally {
        try {
            await state.close();
        } catch {
            result = { ...result, status: "blocked", failure: "source-reader-preparation-cleanup" };
        }
        try {
            await context.close();
        } catch {
            result = { ...result, status: "blocked", failure: "source-reader-publisher-cleanup" };
        }
    }
    return result;
}
