import { expect, test } from "bun:test";
import { incompleteWorkReasons } from "./completeness";
import { collectMetrics } from "./metrics";
import type { ProbeRow } from "./probe";
import type { ProfileMetrics } from "./profiler";

const call = { kind: "http", traceId: "owned", path: "/gateway/audit" };
const body = { kind: "http-body", traceId: "owned", bytes: 17, complete: true };
const command = { kind: "mongo", traceId: "owned", database: "tenant", operation: "find" };
const profile: ProfileMetrics[] = [
    {
        database: "tenant",
        traceId: "owned",
        operations: 1,
        documentsExamined: 2,
        keysExamined: 1,
        documentsReturned: 1,
    },
];
const valid = () => ({
    healthy: true,
    dependenciesComplete: true,
    profileValid: true,
    operationComplete: true,
    rows: [call, body, command] as readonly ProbeRow[],
    calls: [call],
    bodies: [body] as readonly ProbeRow[],
    mongo: [command],
    profile,
});

test("work diagnostics identify each strict gate without accepting missing or cancelled evidence", () => {
    expect(incompleteWorkReasons(valid())).toEqual([]);
    for (const [key, reason] of [
        ["healthy", "probe-health"],
        ["dependenciesComplete", "dependency-evidence"],
        ["profileValid", "profile-shape"],
        ["operationComplete", "operation-witness"],
    ] as const) {
        expect(incompleteWorkReasons({ ...valid(), [key]: false })).toEqual([reason]);
    }
    expect(incompleteWorkReasons({ ...valid(), rows: [...valid().rows, { kind: "overflow" }] })).toEqual([
        "probe-overflow",
    ]);
    expect(incompleteWorkReasons({ ...valid(), bodies: [] })).toEqual(["network-body-count"]);
    for (const bytes of [-1, Number.NaN, undefined]) {
        expect(incompleteWorkReasons({ ...valid(), bodies: [{ ...body, bytes }] })).toEqual([
            "network-body-incomplete",
        ]);
    }
    expect(incompleteWorkReasons({ ...valid(), bodies: [{ ...body, complete: false }] })).toEqual([
        "network-body-incomplete",
    ]);
    expect(incompleteWorkReasons({ ...valid(), profile: [] })).toEqual(["mongo-witness"]);
});

test("all failed gates yield at most eight fixed symbols and persist without remote data", () => {
    const reasons = incompleteWorkReasons({
        ...valid(),
        healthy: false,
        dependenciesComplete: false,
        profileValid: false,
        operationComplete: false,
        rows: [{ kind: "overflow", payload: "private-token" }],
        calls: [call, call],
        bodies: [{ ...body, complete: false, message: "private-error" }],
        profile: [],
    });
    expect(reasons).toEqual([
        "probe-health",
        "dependency-evidence",
        "profile-shape",
        "operation-witness",
        "probe-overflow",
        "network-body-count",
        "network-body-incomplete",
        "mongo-witness",
    ]);
    expect(JSON.stringify(reasons)).not.toContain("private");
    const partial = collectMetrics("owned", [call, { ...body, complete: false }], [], true);
    expect(partial.work.instrumentationComplete).toBe(false);
    expect(partial.work.instrumentationFailures).toEqual(["network-body-incomplete"]);
    expect(partial.work.internalRequests).toBe(1);
    expect(partial.work.internalResponseBytes).toBe(17);
    const complete = collectMetrics("owned", [call, body], [], true);
    expect(complete.work.instrumentationComplete).toBe(true);
    expect(complete.work).not.toHaveProperty("instrumentationFailures");
});
