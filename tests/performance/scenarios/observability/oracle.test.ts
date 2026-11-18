import { expect, test } from "bun:test";
import { assertLogAggregate, assertLogEntry, assertLogQuery } from "./oracle";
import { observabilityReadScenarios } from "./plan";
import { performanceCapabilityInventory } from "../../capabilities/inventory";
import { assessmentScenarios } from "../plan";
import { auditPlan } from "../../capabilities/coverage";

test("log oracles reject stale counts, foreign records, unsanitized fields, wrong cursors and wrong reception order", () => {
    const now = Date.now();
    const window = { from: new Date(now - 1000).toISOString(), to: new Date(now + 1000).toISOString() };
    const seeds = Array.from({ length: 17 }, (_, index) => ({
        entry: {
            id: `id-${String(index).padStart(3, "0")}`,
            time: new Date(now).toISOString(),
            level: "info",
            event: "performance.read.unit",
            attributes: { fixture: "unit", password: "Must not survive" },
        },
        receivedAfter: now,
        receivedBefore: now,
    }));
    const details = seeds.map((seed) => ({
        ...seed.entry,
        instanceId: "owned",
        service: "cms-edge",
        receivedAt: new Date(now).toISOString(),
        attributes: { fixture: "unit", password: "[REDACTED]" },
    }));
    const summary = details.map(({ attributes: _attributes, ...row }) => row).reverse();
    const page = { ...window, items: summary.slice(0, 16), nextCursor: "opaque-signed-cursor" };
    expect(() => assertLogQuery(page, seeds, "owned", window, 17)).not.toThrow();
    expect(() => assertLogEntry(details[0], seeds[0]!, "owned", true)).not.toThrow();
    for (const output of [
        { ...details[0], instanceId: "other" },
        { ...details[0], attributes: seeds[0]!.entry.attributes },
        { ...details[0], receivedAt: new Date(now + 10000).toISOString() },
        { ...details[0], fingerprint: "private" },
    ]) {
        expect(() => assertLogEntry(output, seeds[0]!, "owned", true)).toThrow();
    }
    for (const output of [
        { ...page, items: [...page.items].reverse() },
        { ...page, nextCursor: null },
        { ...page, items: [page.items[0], ...page.items.slice(0, 15)] },
        { ...page, from: window.to },
        { ...page, items: [{ ...page.items[0], id: "foreign" }, ...page.items.slice(1)] },
        { ...page, items: [{ ...page.items[0], attributes: {} }, ...page.items.slice(1)] },
    ]) {
        expect(() => assertLogQuery(output, seeds, "owned", window, 17)).toThrow();
    }
    const aggregate = { total: 17, groups: [{ key: "info", count: 17 }], truncated: false };
    expect(() => assertLogAggregate(aggregate, seeds)).not.toThrow();
    for (const output of [
        { ...aggregate, total: 16 },
        { ...aggregate, groups: [] },
        { ...aggregate, truncated: true },
    ]) {
        expect(() => assertLogAggregate(output, seeds)).toThrow();
    }
    const cardinal = Array.from({ length: 66 }, (_, index) => ({
        ...seeds[0]!,
        entry: { ...seeds[0]!.entry, event: `performance.event${String(index).padStart(3, "0")}` },
    }));
    const grouped = {
        total: 66,
        groups: cardinal.slice(0, 50).map((seed) => ({ key: seed.entry.event, count: 1 })),
        truncated: true,
    };
    expect(() => assertLogAggregate(grouped, cardinal, "event")).not.toThrow();
    expect(() => assertLogAggregate({ ...grouped, truncated: false }, cardinal, "event")).toThrow();
});

test("all current observability HTTP/MCP obligations have definitions and removal is blocking", async () => {
    const inventory = await performanceCapabilityInventory();
    const added = observabilityReadScenarios(inventory, "unit");
    expect(added).toHaveLength(14);
    expect(added.every((row) => row.definition.version === 2)).toBe(true);
    const targets = inventory.targets.filter((target) => target.release.contractId === "ulvia/cms.observability");
    const keys = new Set(targets.map((target) => target.key));
    const plan = assessmentScenarios(inventory, "unit")
        .map((row) => row.definition)
        .filter((row) => row.obligations.every((item) => keys.has(item.target)));
    expect(auditPlan({ ...inventory, targets }, plan)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            plan.filter((row) => row.id !== added[0]!.definition.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
