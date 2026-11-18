import { expect, test } from "bun:test";
import { assertCatalogueRow, catalogueOracle, searchOracle } from "../metadata/oracle";
import { unitPublicResource } from "./model/resource";

test("catalogue projections reject stale metadata, invalid publication dates, duplicate rows, skipped pages and false exhaustion", () => {
    const stamp = Date.now();
    const resources = [0, 1].map((index) => ({
        ...unitPublicResource("contract", index, 0),
        startedAt: stamp,
        finishedAt: stamp,
    }));
    const rows = resources.map((row) => ({
        ...row.reference,
        metadata: { ...row.metadata, publishedAt: new Date(stamp).toISOString() },
    }));
    expect(() => catalogueOracle(resources, 0, 1)({ releases: rows.slice(0, 1), nextCursor: "unit_1" })).not.toThrow();
    expect(() => catalogueOracle(resources, 1, 1)({ releases: rows.slice(1) })).not.toThrow();
    expect(() => catalogueOracle(resources, 0, 1)({ releases: rows.slice(0, 1) })).toThrow();
    expect(() => catalogueOracle(resources, 0, 2)({ releases: [rows[0], rows[0]] })).toThrow();
    expect(() =>
        assertCatalogueRow({ ...rows[0], metadata: { ...rows[0]!.metadata, name: "stale" } }, resources[0]!),
    ).toThrow();
    expect(() =>
        assertCatalogueRow(
            { ...rows[0], metadata: { ...rows[0]!.metadata, publishedAt: "2000-01-01T00:00:00.000Z" } },
            resources[0]!,
        ),
    ).toThrow();
});

test("search oracles preserve exact-ID promotion and authored fields without assuming semantic rank ties", () => {
    const resources = [0, 1].map((index) => ({
        ...unitPublicResource("contract", index, 0),
        startedAt: 0,
        finishedAt: 0,
    }));
    const results = resources.map((row) => ({
        reference: row.reference,
        name: row.name,
        description: row.description,
        categories: [],
        contractIds: row.contractIds,
    }));
    const output = { revision: `sha256:${"a".repeat(64)}`, mode: "hybrid", degraded: false, results };
    const assert = searchOracle(resources, resources[0]!, true);
    expect(() => assert(output)).not.toThrow();
    for (const value of [
        { ...output, results: [...results].reverse() },
        { ...output, results: [results[0], results[0]] },
        { ...output, degraded: true },
        { ...output, results: [{ ...results[0], ownerAccountId: "private" }, results[1]] },
        {
            ...output,
            results: [{ ...results[0], reference: { ...results[0]!.reference, version: "old" } }, results[1]],
        },
    ]) {
        expect(() => assert(value)).toThrow();
    }
});
