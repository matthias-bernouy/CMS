import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import { requiredObligations } from "../../../capabilities/policies";
import { auditPlan, coverageMatrix } from "../../../capabilities/coverage";
import { assessmentScenarios } from "../../plan";
import { COMPOSITION_EDITORS } from "./plan";

const inventory = await performanceCapabilityInventory();
const ids = [...COMPOSITION_EDITORS, "site.favicon.get", "site.favicon.update"];
const targets = inventory.targets.filter(
    (row) => row.release.contractId === "ulvia/cms.content" && ids.includes(row.definition.id),
);
const keys = new Set(targets.map((row) => row.key));
const scenarios = assessmentScenarios(inventory, "content-editing-plan")
    .map((row) => row.definition)
    .filter((row) => row.obligations.every((obligation) => keys.has(obligation.target)));

test("all six current editing and favicon executors receive exact HTTP/MCP variants and no synthetic execution credit", () => {
    expect(targets).toHaveLength(6);
    expect(targets.flatMap(requiredObligations)).toHaveLength(54);
    expect(scenarios).toHaveLength(62);
    expect(auditPlan({ ...inventory, targets }, scenarios)).toEqual([]);
    expect(coverageMatrix({ ...inventory, targets }, scenarios, []).every((row) => row.status === "unattempted")).toBe(
        true,
    );
    expect(scenarios.filter((row) => row.obligations[0]!.variant === "invalidation")).toHaveLength(6);
    const missing = scenarios.find((row) => row.id.includes("site-blocs.delete.mcp.cold"))!;
    expect(
        auditPlan(
            { ...inventory, targets },
            scenarios.filter((row) => row !== missing),
        ).some(
            (row) =>
                row.code === "missing-scenario" &&
                row.obligation?.binding === "mcp" &&
                row.obligation.variant === "cold",
        ),
    ).toBe(true);
});

test("detailed and identity readers include large Unicode snapshots and diverging publication history", () => {
    const additions = scenarios.filter((row) => ["large", "history"].includes(row.obligations[0]!.variant));
    expect(additions).toHaveLength(8);
    expect(additions.every((row) => /site-blocs\.(read|identity)/u.test(row.id))).toBe(true);
    expect(additions.every((row) => row.budget.requestBytes > 0 && row.budget.responseBytes > 0)).toBe(true);
});
