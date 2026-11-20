import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../capabilities/coverage";
import { obligationKey } from "../../../../capabilities/types";
import { metadataCatalogueScenarios } from "../plan";

test("twenty metadata variants cover exact current bindings and missing variants remain blocking without fixture credit", async () => {
    const inventory = await performanceCapabilityInventory();
    const definitions = metadataCatalogueScenarios(inventory, "unit-plan").map((row) => row.definition);
    expect(definitions).toHaveLength(20);
    const targets = new Set(definitions.flatMap((row) => row.obligations.map((obligation) => obligation.target)));
    const selected = { ...inventory, targets: inventory.targets.filter((row) => targets.has(row.key)) };
    const keys = new Set(definitions.flatMap((row) => row.obligations.map(obligationKey)));
    expect(keys.size).toBe(20);
    expect(
        auditPlan(selected, definitions).filter((row) => row.obligation && keys.has(obligationKey(row.obligation))),
    ).toEqual([]);
    expect(
        auditPlan(selected, definitions.slice(1)).some(
            (row) => row.code === "missing-scenario" && row.obligation && keys.has(obligationKey(row.obligation)),
        ),
    ).toBe(true);
    expect(coverageMatrix(selected, definitions, []).every((row) => row.status !== "covered")).toBe(true);
});
