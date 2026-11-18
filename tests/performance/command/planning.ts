import { performanceCapabilityInventory } from "../capabilities/inventory";
import { assessmentScenarios } from "../scenarios/plan";
import { assertPerformancePlan } from "../assessment/selection";

/** Static admission and coverage checks do not acquire images, listeners or containers. */
export async function performancePlan() {
    const inventory = await performanceCapabilityInventory();
    const scenarios = assessmentScenarios(inventory, "static-performance-plan");
    assertPerformancePlan(
        inventory,
        scenarios.map((row) => row.definition),
    );
    return { inventory, scenarios };
}

export type PerformancePlan = Awaited<ReturnType<typeof performancePlan>>;
