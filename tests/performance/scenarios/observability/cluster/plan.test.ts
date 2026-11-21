import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { auditPlan } from "../../../capabilities/coverage";
import { requiredObligations } from "../../../capabilities/policies";
import { clusterLogScenarios } from "./plan";

test("every operator log obligation has an executable scenario and removing one is blocking", async () => {
    const inventory = await performanceCapabilityInventory();
    const targets = inventory.targets.filter((target) => target.release.contractId === "ulvia/cluster.logs");
    const scoped = { ...inventory, targets, templates: [] };
    const scenarios = clusterLogScenarios(inventory, "unit").map((row) => row.definition);
    expect(targets).toHaveLength(4);
    expect(auditPlan(scoped, scenarios, targets.flatMap(requiredObligations))).toEqual([]);
    expect(auditPlan(scoped, scenarios.slice(1)).some((row) => row.code === "missing-scenario")).toBe(true);
    expect(scenarios.filter((row) => row.load).every((row) => row.load!.concurrency === 4)).toBe(true);
});
