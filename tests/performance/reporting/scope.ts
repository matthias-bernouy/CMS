import { obligationKey } from "../capabilities/types";
import type { Finding, ScenarioDefinition } from "../capabilities/types";
import type { RunMetadata } from "./types";

/** A selected report keeps the full inventory but cannot claim exhaustive coverage. */
export function selectionFindings(
    metadata: Pick<RunMetadata, "selection">,
    scenarios: readonly ScenarioDefinition[],
): Finding[] {
    const selection = metadata.selection;
    if (!selection) {
        return [];
    }
    const ids = scenarios.map((row) => row.id);
    if (
        selection.kind !== "selected-scenarios" ||
        !Array.isArray(selection.scenarioIds) ||
        !selection.scenarioIds.length ||
        new Set(selection.scenarioIds).size !== selection.scenarioIds.length ||
        JSON.stringify(selection.scenarioIds) !== JSON.stringify(ids) ||
        !Number.isSafeInteger(selection.plannedScenarios) ||
        selection.plannedScenarios < ids.length
    ) {
        return [
            { code: "invalid-selection", message: "Selected report scope does not match its scenario definitions" },
        ];
    }
    return [];
}

export function selectedObligations(
    metadata: Pick<RunMetadata, "selection">,
    scenarios: readonly ScenarioDefinition[],
) {
    if (!metadata.selection || selectionFindings(metadata, scenarios).length) {
        return undefined;
    }
    return [...new Map(scenarios.flatMap((row) => row.obligations).map((row) => [obligationKey(row), row])).values()];
}
