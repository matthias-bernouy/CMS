import { expect, test } from "bun:test";
import { collectMetrics } from "./metrics";

test("a profiled control database cannot conceal an unprofiled tenant under the same request trace", () => {
    const control = { kind: "mongo", database: "control", traceId: "root" };
    const fresh = { ...control, database: "fresh-tenant" };
    const profile = {
        database: "control",
        traceId: "root",
        operations: 2,
        documentsExamined: 3,
        keysExamined: 3,
        documentsReturned: 1,
    };
    const missing = collectMetrics("root", [control, fresh], [profile], true);
    expect(missing.work.mongoOperations).toBe(2);
    expect(missing.work.instrumentationComplete).toBe(false);
    const complete = collectMetrics(
        "root",
        [control, fresh],
        [profile, { ...profile, database: "fresh-tenant", documentsExamined: 10 }],
        true,
    );
    expect(complete.work.instrumentationComplete).toBe(true);
    expect(complete.work.documentsExamined).toBe(13);
    expect(
        collectMetrics("root", [{ kind: "mongo", traceId: "root" }], [profile], true).work.instrumentationComplete,
    ).toBe(false);
    expect(
        collectMetrics("root", [fresh], [{ ...profile, traceId: "foreign" }], true).work.instrumentationComplete,
    ).toBe(false);
});
