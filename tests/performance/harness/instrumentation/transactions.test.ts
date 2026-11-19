import { expect, test } from "bun:test";
import { transactionProbe, transactionWitness } from "./transactions";

type Row = Readonly<Record<string, unknown>>;
const started = {
    kind: "mongo",
    database: "admin",
    operation: "abortTransaction",
    requestId: 7,
    traceId: "root",
    spanId: "business",
};
const terminal = { ...started, kind: "mongo-transaction", durationMs: 1.5, outcome: "failed" };

test("transaction evidence requires one exact terminal event and accepts observed failures as real work", () => {
    expect(transactionWitness(started, [terminal])).toEqual({
        database: "admin",
        operation: "abortTransaction",
        requestId: 7,
        traceId: "root",
        spanId: "business",
        durationMs: 1.5,
        outcome: "failed",
    });
    expect(transactionWitness(started, [{ ...terminal, outcome: "succeeded" }])?.outcome).toBe("succeeded");
    expect(transactionWitness(started, [])).toBeUndefined();
    expect(transactionWitness(started, [terminal, terminal])).toBeUndefined();
    for (const change of [
        { requestId: 8 },
        { database: "tenant" },
        { operation: "commitTransaction" },
        { traceId: "foreign" },
        { spanId: "another" },
        { durationMs: -1 },
        { durationMs: NaN },
        { outcome: "unknown" },
    ]) {
        expect(transactionWitness(started, [{ ...terminal, ...change }])).toBeUndefined();
    }
    expect(
        transactionWitness({ ...started, operation: "aggregate" }, [{ ...terminal, operation: "aggregate" }]),
    ).toBeUndefined();
    expect(transactionWitness({ ...started, requestId: undefined }, [terminal])).toBeUndefined();
});

test("transaction probes retain only safe metadata and correlate using the original request context", () => {
    const rows: Row[] = [];
    const probe = transactionProbe((row) => rows.push(row));
    const command = {
        requestId: 7,
        databaseName: "admin",
        commandName: "abortTransaction",
        command: { private: "must-not-be-recorded" },
    };
    probe.started(command, { traceId: "root", spanId: "business" });
    const end = {
        ...command,
        duration: 1.5,
        failure: new Error("must-not-be-recorded"),
        reply: { private: "must-not-be-recorded" },
    };
    probe.finished(end, "failed");
    expect(rows).toEqual([terminal]);
    expect(JSON.stringify(rows)).not.toContain("must-not-be-recorded");
    expect(transactionWitness(started, rows)).toBeDefined();
});

test("transaction pending bounds refuse overflow without losing existing evidence and release failed requests", () => {
    const rows: Row[] = [];
    const probe = transactionProbe((row) => rows.push(row), 1);
    const command = { requestId: 1, databaseName: "admin", commandName: "commitTransaction" };
    probe.started(command, { traceId: "first" });
    probe.started({ ...command, requestId: 2 }, { traceId: "overflow" });
    expect(rows).toContainEqual({
        kind: "overflow",
        component: "mongo-transaction",
        traceId: "overflow",
        spanId: undefined,
    });
    probe.finished({ ...command, duration: 2 }, "failed");
    probe.started({ ...command, requestId: 3 }, { traceId: "reused" });
    probe.finished({ ...command, requestId: 3, duration: 1 }, "succeeded");
    expect(rows.filter((row) => row.kind === "mongo-transaction").map((row) => row.traceId)).toEqual([
        "first",
        "reused",
    ]);
});

test("duplicate or malformed transaction terminals fail closed and do not leak driver payloads", () => {
    const rows: Row[] = [];
    const probe = transactionProbe((row) => rows.push(row), 1);
    const command = {
        requestId: 1,
        databaseName: "admin",
        commandName: "commitTransaction",
        command: { private: "must-not-be-recorded" },
    };
    probe.started(command, { traceId: "first" });
    probe.started(command, { traceId: "second" });
    expect(rows.filter((row) => row.kind === "overflow").map((row) => row.traceId)).toEqual(["first", "second"]);
    probe.started({ ...command, requestId: 2 }, { traceId: "third" });
    probe.finished({ ...command, requestId: 2, databaseName: "foreign", duration: 1 }, "succeeded");
    probe.started({ ...command, requestId: 3 }, { traceId: "fourth" });
    probe.finished({ ...command, requestId: 3, duration: NaN }, "succeeded");
    expect(rows.every((row) => row.kind === "overflow")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("must-not-be-recorded");
});

test("unrelated or unattributed Mongo commands cannot consume transaction probe capacity", () => {
    const rows: Row[] = [];
    const probe = transactionProbe((row) => rows.push(row), 1);
    const command = { requestId: 1, databaseName: "admin", commandName: "commitTransaction" };
    probe.started({ ...command, commandName: "aggregate" }, { traceId: "root" });
    probe.started(command, {});
    probe.finished({ ...command, duration: 1 }, "succeeded");
    expect(rows).toEqual([]);
    probe.started(command, { traceId: "root" });
    probe.finished({ ...command, duration: 1 }, "succeeded");
    expect(rows).toHaveLength(1);
    for (const limit of [0, 1025, NaN]) {
        expect(() => transactionProbe(() => {}, limit)).toThrow();
    }
});
