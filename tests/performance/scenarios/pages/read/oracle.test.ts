import { expect, test } from "bun:test";
import { pageListOracle } from "./oracle";
import { pageReadScenarios } from "./plan";
import { assessmentScenarios } from "../../plan";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { auditPlan } from "../../../capabilities/coverage";

test("Page list oracle rejects wrong rows, order, duplicate IDs, cursors and leaked details", () => {
    const rows = Array.from({ length: 33 }, (_, index) => ({
        id: `page-${index}`,
        path: `/page-${index}`,
        title: `Page ${index}`,
        visible: false,
    }));
    const first = { items: rows.slice(0, 16), nextCursor: rows[15]!.id };
    expect(() => pageListOracle(rows, 0, 16)(first)).not.toThrow();
    for (const output of [
        { ...first, items: first.items.slice(0, 15) },
        { ...first, items: [...first.items].reverse() },
        { ...first, items: [first.items[0], ...first.items.slice(0, 15)] },
        { ...first, nextCursor: rows[16]!.id },
        { ...first, items: [{ ...first.items[0], content: "Must not leak" }, ...first.items.slice(1)] },
        { ...first, items: [{ ...first.items[0], title: "Stale title" }, ...first.items.slice(1)] },
    ]) {
        expect(() => pageListOracle(rows, 0, 16)(output)).toThrow("page-list-exact-page");
    }
    expect(() => pageListOracle(rows, 32, 16)({ items: [rows[32]] })).not.toThrow();
    expect(() => pageListOracle(rows, 33, 16)({ items: [] })).not.toThrow();
    expect(() => pageListOracle(rows, 33, 16)({ items: [], nextCursor: null })).toThrow();
    expect(() => pageListOracle(rows, -1, 16)).toThrow();
    expect(() => pageListOracle(rows, 34, 16)).toThrow();
    expect(() => pageListOracle(rows, 0, 0)).toThrow();
});

test("native Page list current HTTP/MCP matrix includes all six advanced variants", async () => {
    const inventory = await performanceCapabilityInventory();
    const advanced = pageReadScenarios(inventory, "unit");
    expect(advanced).toHaveLength(6);
    const target = inventory.targets.find((row) => row.definition.id === "pages.list")!;
    const plans = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((obligation) => obligation.target === target.key));
    expect(auditPlan({ ...inventory, targets: [target] }, plans)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets: [target] },
            plans.filter((row) => row.id !== advanced[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
