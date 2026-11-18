import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../../../capabilities/coverage";
import { operationReaderScenarios } from "../plan";

test("operation lists define all six current large/history/invalidation bindings with blocking omissions and no synthetic coverage", async () => {
    const inventory = await performanceCapabilityInventory();
    const scenarios = operationReaderScenarios(inventory, "planning")
        .filter((row) => row.definition.id.includes(".list-operations."))
        .map((row) => row.definition);
    expect(scenarios).toHaveLength(6);
    const target = scenarios[0]!.obligations[0]!.target;
    const selected = { ...inventory, targets: inventory.targets.filter((row) => row.key === target) };
    const relevant = (variant: string) => ["large", "history", "invalidation"].includes(variant);
    expect(auditPlan(selected, scenarios).filter((row) => row.obligation && relevant(row.obligation.variant))).toEqual(
        [],
    );
    expect(
        auditPlan(selected, scenarios.slice(1)).some(
            (row) => row.code === "missing-scenario" && row.obligation && relevant(row.obligation.variant),
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, scenarios, []).every((row) => row.status !== "covered")).toBe(true);
});
