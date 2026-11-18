import { expect, test } from "bun:test";
import { collectMetrics } from "./metrics";
import { parseProbe } from "./probe";

test("initialization phases retain repeated work and failed calls without attributing another trace", () => {
    const row = { kind: "initialization-phase", traceId: "a", name: "verify.metadata", durationMs: 5, success: true };
    const result = collectMetrics(
        "a",
        [row, { ...row, durationMs: 8, success: false }, { ...row, traceId: "foreign" }],
        [],
        true,
    );
    expect(result.phases).toEqual([{ name: "verify.metadata", calls: 2, failed: 1, totalMs: 13, maxMs: 8 }]);
    expect(() => collectMetrics("a", [{ ...row, durationMs: NaN }], [], true)).toThrow();
});

test("trace metrics account for consumed internal bodies and actual profiler examination counts", () => {
    const rows = [
        { kind: "http", traceId: "a" },
        { kind: "http-body", traceId: "a", bytes: 123, complete: true },
        { kind: "mongo", database: "fixture", traceId: "a", operation: "find" },
        {
            kind: "capability",
            traceId: "a",
            target: "contract#digest:read",
            binding: "mcp",
            success: true,
            durationMs: 4,
        },
        { kind: "mongo", traceId: "another-request" },
    ];
    const profile = [
        {
            database: "fixture",
            traceId: "a",
            operations: 1,
            documentsExamined: 40,
            keysExamined: 2,
            documentsReturned: 1,
        },
    ];
    const result = collectMetrics("a", rows, profile, true);
    expect(result.work).toEqual({
        mongoOperations: 1,
        documentsExamined: 40,
        keysExamined: 2,
        documentsReturned: 1,
        internalRequests: 1,
        internalResponseBytes: 123,
        instrumentationComplete: true,
    });
    expect(result.invocations[0]?.binding).toBe("mcp");
    expect(result.invocations[0]?.traceId).toBe("a");
    for (const broken of [
        collectMetrics("a", rows, [], true),
        collectMetrics("a", rows, profile, false),
        collectMetrics("a", [...rows, { kind: "overflow", traceId: "a" }], profile, true),
        collectMetrics(
            "a",
            rows.filter((row) => row.kind !== "http-body"),
            profile,
            true,
        ),
        collectMetrics(
            "a",
            rows.map((row) => (row.kind === "http-body" ? { ...row, complete: false } : row)),
            profile,
            true,
        ),
    ]) {
        expect(broken.work.instrumentationComplete).toBe(false);
    }
});

test("corrupt probe records and malformed witnesses fail instead of producing zero metrics", () => {
    expect(parseProbe('{"kind":"mongo","traceId":"a"}\n')).toHaveLength(1);
    for (const text of ["{}", "[]", "null", "invalid"]) {
        expect(() => parseProbe(text)).toThrow();
    }
    expect(() => collectMetrics("a", [{ kind: "capability", traceId: "a", durationMs: NaN }], [], true)).toThrow();
});

test("internal network evidence retains per-route counts and fully consumed byte volumes", () => {
    const result = collectMetrics(
        "a",
        [
            { kind: "http", traceId: "a", path: "/gateway/route" },
            { kind: "http-body", traceId: "a", path: "/gateway/route", bytes: 1024, complete: true },
            { kind: "http", traceId: "a", path: "/gateway/route" },
            { kind: "http-body", traceId: "a", path: "/gateway/route", bytes: 2048, complete: true },
        ],
        [],
        true,
    );
    expect(result.network).toEqual([{ path: "/gateway/route", requests: 2, responseBytes: 3072 }]);
    expect(result.work.internalResponseBytes).toBe(3072);
});

test("MCP coverage requires matching successful Gateway representation and actual Provider execution", () => {
    const execution = {
        kind: "capability",
        traceId: "a",
        contractId: "test/contract",
        capabilityId: "read",
        target: "test/contract@1#digest:read",
        binding: "http",
        durationMs: 3,
        success: true,
        spanId: "business",
    };
    const binding = {
        kind: "binding",
        traceId: "a",
        contractId: "test/contract",
        capabilityId: "read",
        binding: "mcp",
        transport: "mcp",
        success: true,
    };
    expect(collectMetrics("a", [execution], [], true).invocations.map((row) => row.binding)).toEqual(["http"]);
    expect(collectMetrics("a", [execution, binding], [], true).invocations.map((row) => row.binding)).toEqual([
        "http",
        "mcp",
    ]);
    for (const invalid of [
        { ...binding, success: false },
        { ...binding, traceId: "b" },
        { ...binding, capabilityId: "another" },
        { ...binding, contractId: "another/contract" },
    ]) {
        expect(collectMetrics("a", [execution, invalid], [], true).invocations).toHaveLength(1);
    }
    const metrics = collectMetrics(
        "a",
        [
            execution,
            { kind: "mongo", database: "fixture", traceId: "a", spanId: "business" },
            { kind: "mongo", database: "fixture", traceId: "a", spanId: "authentication" },
        ],
        [
            {
                database: "fixture",
                traceId: "a",
                spanId: "business",
                operations: 1,
                documentsExamined: 2,
                keysExamined: 2,
                documentsReturned: 1,
            },
            {
                database: "fixture",
                traceId: "a",
                spanId: "authentication",
                operations: 1,
                documentsExamined: 3,
                keysExamined: 3,
                documentsReturned: 1,
            },
        ],
        true,
        execution.target,
    );
    expect(metrics.breakdown).toEqual({
        handlerMs: 3,
        businessMongoOperations: 1,
        commonMongoOperations: 1,
        businessDocumentsExamined: 2,
        commonDocumentsExamined: 3,
        businessInternalRequests: 0,
        commonInternalRequests: 0,
    });
});
