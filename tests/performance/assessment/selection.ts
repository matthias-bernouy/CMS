import { auditPlan } from "../capabilities/coverage";
import type { CapabilityInventory, ScenarioDefinition } from "../capabilities/types";

export function assertPerformancePlan(inventory: CapabilityInventory, scenarios: readonly ScenarioDefinition[]) {
    const findings = auditPlan(inventory, scenarios);
    if (findings.length) {
        throw new Error(
            `Invalid performance plan: ${findings.map((row) => `${row.code}:${row.scenario ?? row.obligation?.target ?? "plan"}`).join(", ")}`,
        );
    }
}

/** Exact IDs preserve canonical plan order, even if CLI arguments repeat or reorder them. */
export function selectScenarios<T extends { definition: ScenarioDefinition }>(
    scenarios: readonly T[],
    ids: readonly string[],
): T[] {
    if (!ids.length) {
        return [...scenarios];
    }
    const requested = new Set(ids);
    const known = new Set(scenarios.map((row) => row.definition.id));
    const unknown = [...requested].filter((id) => !known.has(id));
    if (unknown.length) {
        throw new Error(`Unknown performance scenario: ${unknown.join(", ")}. Use bun run perf --list.`);
    }
    return scenarios.filter((row) => requested.has(row.definition.id));
}
