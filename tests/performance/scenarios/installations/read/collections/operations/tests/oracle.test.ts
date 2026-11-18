import { expect, test } from "bun:test";
import { operationPageOracle } from "../oracle";

import { operationRows } from "./rows";

test("list projections require known immutable job metadata, complete invalidation results and no private detail payload", () => {
    const known = new Map(operationRows.map((row) => [row.operationId, row]));
    const oracle = operationPageOracle(known, 2);
    expect(() => oracle({ items: operationRows.slice(0, 2), nextCursor: "opaque-next" })).not.toThrow();
    for (const items of [
        [operationRows[0], operationRows[0]],
        [{ ...operationRows[0], status: "running" }],
        [{ ...operationRows[0], revision: 2 }],
        [{ ...operationRows[0], operationId: crypto.randomUUID() }],
        [{ ...operationRows[0], result: { context: "private" } }],
    ]) {
        expect(() => oracle({ items })).toThrow();
    }
    expect(() => operationPageOracle(known, 100, true)({ items: operationRows })).not.toThrow();
    expect(() => operationPageOracle(known, 100, true)({ items: operationRows.slice(0, 2) })).toThrow();
    expect(() => operationPageOracle(known, 100, true)({ items: operationRows, nextCursor: "false-more" })).toThrow();
    expect(() => operationPageOracle(known, 16, false, true)({ items: [] })).toThrow();
    expect(() => operationPageOracle(new Map(), 100, true)({ items: [] })).not.toThrow();
});
