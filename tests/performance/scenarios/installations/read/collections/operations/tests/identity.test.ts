import { expect, test } from "bun:test";
import { initializeIdentityJournal, operationIdentityOracle } from "../identity";
import { operationRows } from "./rows";
import { performanceCapabilityInventory } from "../../../../../../capabilities/inventory";
import { assessmentScenarios } from "../../../../../plan";
import { auditPlan, coverageMatrix } from "../../../../../../capabilities/coverage";
import { obligationKey } from "../../../../../../capabilities/types";

test("journal growth cannot replace an addressed completed job with another result, a later revision or private metadata", () => {
    const old = operationRows[0]!;
    const result = { upgradeId: `sha256:${"a".repeat(64)}`, status: "completed", selectionRevision: 2 };
    const expected = { ...old, result };
    const oracle = operationIdentityOracle(old, result);
    expect(() => oracle(expected)).not.toThrow();
    for (const wrong of [
        { ...expected, operationId: operationRows[1]!.operationId },
        { ...expected, revision: old.revision + 1 },
        { ...expected, result: { ...result, selectionRevision: 3 } },
        { ...expected, input: { secret: "private" } },
    ]) {
        expect(() => oracle(wrong)).toThrow();
    }
});

test("all eight recovery/status/job reader invalidations are registered with exact bindings and remain uncovered before real measurements", async () => {
    const inventory = await performanceCapabilityInventory();
    const capabilities = ["get-contract-upgrade", "get-collection-upgrade", "get-site-upgrade-status", "get-operation"];
    const targets = inventory.targets.filter(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            capabilities.includes(row.definition.id),
    );
    const keys = new Set(targets.map((row) => row.key));
    const definitions = assessmentScenarios(inventory, "planning")
        .map((row) => row.definition)
        .filter((row) =>
            row.obligations.some((obligation) => keys.has(obligation.target) && obligation.variant === "invalidation"),
        );
    expect(definitions).toHaveLength(8);
    expect(new Set(definitions.flatMap((row) => row.obligations.map(obligationKey))).size).toBe(8);
    const selected = { ...inventory, targets };
    expect(auditPlan(selected, definitions).filter((row) => row.obligation?.variant === "invalidation")).toEqual([]);
    expect(
        auditPlan(selected, definitions.slice(1)).some(
            (row) => row.code === "missing-scenario" && row.obligation?.variant === "invalidation",
        ),
    ).toBe(true);
    expect(
        coverageMatrix(selected, definitions, [])
            .filter((row) => row.obligation.variant === "invalidation")
            .every((row) => row.status !== "covered"),
    ).toBe(true);
});

test("standalone job invalidation seeds two real writer receipts, preserving grant parity without reseeding an existing journal", async () => {
    const known = new Map();
    let calls = 0;
    const append = async () => {
        const row = operationRows[calls++]!;
        known.set(row.operationId, row);
        return row.operationId;
    };
    await initializeIdentityJournal(known, append);
    expect(calls).toBe(2);
    expect(known.size).toBe(2);
    await initializeIdentityJournal(known, append);
    expect(calls).toBe(2);
    let refused = 0;
    await expect(
        initializeIdentityJournal(new Map(), async () => {
            refused++;
            throw new Error("unknown write result");
        }),
    ).rejects.toThrow("unknown write");
    expect(refused).toBe(1);
});
