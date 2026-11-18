import { expect, test } from "bun:test";
import { pageScaleScenarios } from "./plan";
import { assessmentScenarios } from "../../plan";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { auditPlan } from "../../../capabilities/coverage";

test("all eight native Page capabilities have their required current HTTP/MCP variants", async () => {
    const inventory = await performanceCapabilityInventory();
    const added = pageScaleScenarios(inventory, "unit");
    expect(added).toHaveLength(34);
    expect(added.filter((row) => row.definition.version === 2)).toHaveLength(4);
    expect(added.filter((row) => row.definition.obligations[0]!.variant === "invalidation")).toHaveLength(2);
    const keys = new Set(added.map((row) => row.definition.obligations[0]!.target));
    const targets = inventory.targets.filter((row) => keys.has(row.key));
    expect(targets).toHaveLength(8);
    const scenarios = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((obligation) => keys.has(obligation.target)));
    expect(auditPlan({ ...inventory, targets }, scenarios)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            scenarios.filter((row) => row.id !== added[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
