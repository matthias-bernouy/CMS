import { expect, test } from "bun:test";
import { collectMetrics } from "./metrics";

const query = {
    kind: "mongo",
    database: "tenant",
    traceId: "root",
    spanId: "business",
    operation: "find",
    requestId: 1,
};
const control = {
    kind: "mongo",
    database: "admin",
    traceId: "root",
    spanId: "business",
    operation: "abortTransaction",
    requestId: 2,
};
const terminal = { ...control, kind: "mongo-transaction", durationMs: 2, outcome: "failed" };
const profile = [
    {
        database: "tenant",
        traceId: "root",
        spanId: "business",
        operations: 1,
        documentsExamined: 7,
        keysExamined: 3,
        documentsReturned: 2,
    },
];

test("profiled application work and terminal transaction controls remain counted without invented examination rows", () => {
    const result = collectMetrics("root", [query, control, terminal], profile, true);
    expect(result.work.mongoOperations).toBe(2);
    expect(result.work.documentsExamined).toBe(7);
    expect(result.work.keysExamined).toBe(3);
    expect(result.work.documentsReturned).toBe(2);
    expect(result.work.instrumentationComplete).toBe(true);
    expect(result.mongoTransactions).toEqual([
        {
            database: "admin",
            traceId: "root",
            spanId: "business",
            operation: "abortTransaction",
            requestId: 2,
            durationMs: 2,
            outcome: "failed",
        },
    ]);
});

test("missing, duplicate or foreign transaction completion cannot establish complete performance evidence", () => {
    for (const rows of [
        [query, control],
        [query, control, terminal, terminal],
        [query, control, { ...terminal, traceId: "foreign" }],
        [query, control, { ...terminal, requestId: 99 }],
        [query, control, { ...terminal, spanId: "another" }],
    ]) {
        const result = collectMetrics("root", rows, profile, true);
        expect(result.work.mongoOperations).toBe(2);
        expect(result.work.instrumentationComplete).toBe(false);
    }
});

test("transaction control evidence never conceals unprofiled tenant reads or arbitrary administrative queries", () => {
    for (const unprofiled of [
        { ...query, database: "unprofiled" },
        { ...control, operation: "aggregate", requestId: 3 },
        { ...control, operation: "find", requestId: 3 },
    ]) {
        const result = collectMetrics("root", [query, control, terminal, unprofiled], profile, true);
        expect(result.work.mongoOperations).toBe(3);
        expect(result.work.instrumentationComplete).toBe(false);
    }
});

test("transaction evidence does not bypass unavailable instrumentation or scoped overflow", () => {
    expect(collectMetrics("root", [query, control, terminal], profile, false).work.instrumentationComplete).toBe(false);
    expect(
        collectMetrics("root", [query, control, terminal, { kind: "overflow", traceId: "root" }], profile, true).work
            .instrumentationComplete,
    ).toBe(false);
});
