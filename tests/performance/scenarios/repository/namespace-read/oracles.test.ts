import { expect, test } from "bun:test";
import {
    assertAuthoringPage,
    assertNamespaceList,
    namespaceEvidence,
    orderedNamespaces,
    verifyNamespacePages,
} from "./oracles";
import type { NamespaceEvidence } from "./oracles";
import { namespaceReadScenarios } from "./plan";
import { assessmentScenarios } from "../../plan";
import { auditPlan } from "../../../capabilities/coverage";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";

const expected: NamespaceEvidence[] = Array.from({ length: 32 }, (_, index) => ({
    namespace: `owned-${String(index).padStart(2, "0")}`,
    revision: index < 31 ? 2 : 1,
    state: index < 31 ? "suspended" : "active",
    updatedAt: "2026-11-18T10:00:00.000Z",
}));
function page(cursor?: string) {
    const remaining = orderedNamespaces(expected).filter((row) => !cursor || row.namespace > cursor);
    return {
        items: remaining.slice(0, 8).map((row) => ({
            namespace: row.namespace,
            repositoryId: "owned-repository",
            revision: row.revision,
            access: row.state === "active" ? "owned" : "suspended",
            checkedAt: new Date().toISOString(),
        })),
        nextCursor: remaining.length > 8 ? remaining[7]!.namespace : null,
    };
}

test("namespace pages prove all 32 reservations, exact ordering, history, projection and exhausted cursor", async () => {
    let reads = 0;
    await verifyNamespacePages(
        async (input) => {
            reads++;
            return page(input.cursor as string | undefined);
        },
        expected,
        "owned-repository",
        Date.now() - 1000,
    );
    expect(reads).toBe(5);
    expect(() => assertNamespaceList({ namespaces: expected }, expected)).not.toThrow();
    expect(() => assertNamespaceList({ namespaces: expected.slice(1) }, expected)).toThrow();
    expect(() => assertNamespaceList({ namespaces: [...expected].reverse() }, expected)).toThrow();
    const check = (value: unknown) => assertAuthoringPage(value, expected, "owned-repository", Date.now() - 1000);
    expect(() => check(page())).not.toThrow();
    for (const transform of [
        (row: ReturnType<typeof page>) => ({ ...row, nextCursor: null }),
        (row: ReturnType<typeof page>) => ({ ...row, accountId: "private-account" }),
        (row: ReturnType<typeof page>) => ({ ...row, items: row.items.slice(1) }),
        (row: ReturnType<typeof page>) => ({
            ...row,
            items: row.items.map((item, index) => (index ? item : { ...item, repositoryId: "foreign" })),
        }),
        (row: ReturnType<typeof page>) => ({
            ...row,
            items: row.items.map((item, index) => (index ? item : { ...item, access: "owned" })),
        }),
        (row: ReturnType<typeof page>) => ({
            ...row,
            items: row.items.map((item, index) => (index ? item : { ...item, token: "private" })),
        }),
    ]) {
        expect(() => check(transform(page()))).toThrow();
    }
    expect(() => namespaceEvidence({ ...expected[0], ownerAccountId: "private" })).toThrow();
});

test("namespace read plans cover required current variants without claiming absent historical executors", async () => {
    const inventory = await performanceCapabilityInventory();
    const plans = namespaceReadScenarios(inventory, "unit");
    expect(plans).toHaveLength(10);
    expect(plans.filter((row) => row.definition.version === 2)).toHaveLength(6);
    expect(plans.filter((row) => row.definition.version === 1)).toHaveLength(4);
    const keys = new Set(plans.flatMap((row) => row.definition.obligations.map((obligation) => obligation.target)));
    const targets = inventory.targets.filter((target) => keys.has(target.key));
    const scenarios = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((obligation) => keys.has(obligation.target)));
    expect(targets).toHaveLength(3);
    expect(auditPlan({ ...inventory, targets }, scenarios)).toEqual([]);
    const removed = plans[0]!.definition.id;
    expect(
        auditPlan(
            { ...inventory, targets },
            scenarios.filter((row) => row.id !== removed),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
