import { ClientFailure } from "../../../../harness/clients/failure";
import { sampleScenario } from "../../../../harness/execution/samples";
import { prepareCollectionRead } from "./read/recipe";
import type { collectionReadContexts } from "./context";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";
import type { CollectionReadState } from "./context/types";

export async function executeCollectionRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    profile: string,
    contexts: ReturnType<typeof collectionReadContexts>,
): Promise<ScenarioResult> {
    let state: CollectionReadState | undefined;
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        measurements: [],
        failure: "collection-read-preparation",
    };
    try {
        state = await contexts(environment, profile);
        const selected = state;
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            prepareCollectionRead(
                inventory,
                environment,
                selected,
                capability,
                definition.obligations[0]!.binding,
                profile,
                index,
            ),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "collection-read-preparation",
        };
    }
    return result;
}
