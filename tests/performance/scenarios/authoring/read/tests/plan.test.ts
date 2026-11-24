import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../capabilities/coverage";
import { authoringReadScenarios } from "../plan";
import { assessmentScenarios } from "../../../plan";

test("Authoring defines every current mandatory binding and variant without counting preparation or historical aliases", async () => {
    const inventory = await performanceCapabilityInventory();
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => row.release.contractId === "ulvia/cms.authoring"),
        templates: [],
    };
    const definitions = assessmentScenarios(inventory, "unit-source-plan")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((item) => scoped.targets.some((target) => target.key === item.target)));
    const added = authoringReadScenarios(inventory, "unit-source-plan");
    expect(added).toHaveLength(32);
    expect(auditPlan(scoped, definitions)).toEqual([]);
    expect(coverageMatrix(scoped, definitions, []).every((row) => row.status === "unattempted")).toBe(true);
    expect(
        auditPlan(
            scoped,
            definitions.filter((row) => row.id !== added[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
