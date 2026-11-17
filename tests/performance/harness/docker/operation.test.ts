import { expect, test } from "bun:test";
import { collectMetrics } from "./metrics";

test("async work includes poll costs but only the root binding and executed durable handler can witness completion", () => {
    const target = "test/contract@1#digest:publish";
    const root = {
        kind: "capability",
        traceId: "root",
        spanId: "handler",
        contractId: "test/contract",
        capabilityId: "publish",
        target,
        binding: "http",
        durationMs: 2,
        success: true,
    };
    const operation = {
        kind: "operation",
        traceId: "root",
        spanId: "handler",
        contractId: "test/contract",
        capabilityId: "publish",
        contractVersion: "1",
        durationMs: 50,
        success: true,
    };
    const poll = {
        ...root,
        traceId: "poll",
        target: "test/contract@1#digest:status",
        capabilityId: "status",
        spanId: "poll-handler",
    };
    const mongo = { kind: "mongo", traceId: "root", spanId: "handler" };
    const profiles = [
        { traceId: "root", operations: 1, documentsExamined: 2, keysExamined: 2, documentsReturned: 1 },
        { traceId: "poll", operations: 1, documentsExamined: 3, keysExamined: 3, documentsReturned: 1 },
    ];
    const rows = [root, operation, poll, mongo, { ...mongo, traceId: "poll", spanId: "poll-handler" }];
    const result = collectMetrics("root", rows, profiles, true, target, ["poll"], true);
    expect(result.work.instrumentationComplete).toBe(true);
    expect(result.work.mongoOperations).toBe(2);
    expect(result.work.documentsExamined).toBe(5);
    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]?.target).toBe(target);
    expect(result.breakdown?.handlerMs).toBe(50);
    expect(result.breakdown?.businessMongoOperations).toBe(1);
    expect(result.breakdown?.commonMongoOperations).toBe(0);
    expect(result.breakdown?.pollMongoOperations).toBe(1);
    for (const corrupt of [
        rows.filter((row) => row.kind !== "operation"),
        rows.map((row) => (row.kind === "operation" ? { ...row, success: false } : row)),
    ]) {
        expect(
            collectMetrics("root", corrupt, profiles, true, target, ["poll"], true).work.instrumentationComplete,
        ).toBe(false);
    }
    expect(
        collectMetrics(
            "root",
            rows,
            profiles.filter((row) => row.traceId !== "poll"),
            true,
            target,
            ["poll"],
            true,
        ).work.instrumentationComplete,
    ).toBe(false);
});
