import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { requiredObligations } from "../../../../../capabilities/policies";
import { obligationKey } from "../../../../../capabilities/types";
import { auditPlan, coverageMatrix } from "../../../../../capabilities/coverage";
import { collectionReaderScenarios } from "../plan";

test("all forty current collection reader variants have exact budgets/bindings; removing one stays blocking and fixtures grant no coverage", async () => {
    const inventory = await performanceCapabilityInventory();
    const scenarios = collectionReaderScenarios(inventory, "planning").map((row) => row.definition);
    expect(scenarios).toHaveLength(40);
    const keys = new Set(scenarios.flatMap((row) => row.obligations.map(obligationKey)));
    const targets = new Set(scenarios.flatMap((row) => row.obligations.map((obligation) => obligation.target)));
    const selected = { ...inventory, targets: inventory.targets.filter((row) => targets.has(row.key)) };
    const expected = selected.targets
        .flatMap(requiredObligations)
        .filter((row) => ["large", "history", "invalidation"].includes(row.variant))
        .map(obligationKey);
    expect(keys).toEqual(new Set(expected));
    expect(keys.size).toBe(40);
    expect(
        auditPlan(selected, scenarios).filter((row) => row.obligation && keys.has(obligationKey(row.obligation))),
    ).toEqual([]);
    expect(
        auditPlan(selected, scenarios.slice(1)).some(
            (row) => row.code === "missing-scenario" && keys.has(obligationKey(row.obligation!)),
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, scenarios, []).every((row) => row.status !== "covered")).toBe(true);
});
