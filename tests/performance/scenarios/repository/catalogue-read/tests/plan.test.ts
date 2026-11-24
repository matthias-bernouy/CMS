import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../capabilities/coverage";
import { assessmentScenarios } from "../../../plan";
import { registryReadScenarios } from "../plan";

test("Repository defines every current exact mandatory binding and variant without credit for setup or retained aliases", async () => {
    const inventory = await performanceCapabilityInventory();
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => row.release.contractId === "ulvia/repository"),
        templates: [],
    };
    const definitions = assessmentScenarios(inventory, "registry-unit-plan")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((item) => scoped.targets.some((target) => target.key === item.target)));
    const added = registryReadScenarios(inventory, "registry-unit-plan");
    expect(added).toHaveLength(18);
    expect(auditPlan(scoped, definitions)).toEqual([]);
    expect(coverageMatrix(scoped, definitions, []).every((row) => row.status === "unattempted")).toBe(true);
    expect(
        auditPlan(
            scoped,
            definitions.filter((row) => row.id !== added[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
