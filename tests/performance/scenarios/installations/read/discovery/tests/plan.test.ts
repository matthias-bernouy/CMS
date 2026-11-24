import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../../capabilities/coverage";
import { siteDiscoveryScenarios } from "../plan";

test("all sixteen selected repository discovery variants have exact bindings, budgets and blocking omissions", async () => {
    const inventory = await performanceCapabilityInventory();
    const definitions = siteDiscoveryScenarios(inventory, "planning").map((row) => row.definition);
    expect(definitions).toHaveLength(16);
    const keys = new Set(definitions.flatMap((row) => row.obligations.map((obligation) => obligation.target)));
    const selected = { ...inventory, targets: inventory.targets.filter((row) => keys.has(row.key)) };
    const relevant = (variant: string) => ["large", "history", "invalidation"].includes(variant);
    expect(
        auditPlan(selected, definitions).filter((row) => row.obligation && relevant(row.obligation.variant)),
    ).toEqual([]);
    expect(
        auditPlan(selected, definitions.slice(1)).some(
            (row) => row.code === "missing-scenario" && row.obligation && relevant(row.obligation.variant),
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, definitions, []).every((row) => row.status !== "covered")).toBe(true);
});
