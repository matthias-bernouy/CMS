import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { newDatabasesProfilerScript } from "./profiler";

test("new-tenant profiling preserves earlier traces, enables only new databases and refuses another filter", () => {
    const filter = {
        $or: [
            { "command.comment.ulviaPerformanceTrace": { $exists: true } },
            { "originatingCommand.comment.ulviaPerformanceTrace": { $exists: true } },
        ],
    };
    const rows = ["previous-warmup-trace"];
    const changes: string[] = [];
    const existing = {
        getProfilingStatus: () => ({ was: 2, filter }),
        getCollectionNames: () => ["system.profile"],
        setProfilingLevel: () => {
            throw new Error("Existing profiling must not change");
        },
        system: {
            profile: {
                drop: () => {
                    rows.length = 0;
                },
            },
        },
    };
    const fresh = {
        getProfilingStatus: () => ({ was: 0 }),
        getCollectionNames: () => [],
        createCollection: () => changes.push("created"),
        setProfilingLevel: (level: number, options: unknown) => {
            expect(level).toBe(2);
            expect(options).toEqual({ filter });
            changes.push("enabled");
        },
    };
    let output = "";
    const db = {
        adminCommand: () => ({ databases: ["admin", "existing", "fresh"].map((name) => ({ name })) }),
        getSiblingDB: (name: string) => (name === "existing" ? existing : fresh),
    };
    runInNewContext(newDatabasesProfilerScript(), {
        db,
        print: (value: string) => {
            output = value;
        },
    });
    expect(rows).toEqual(["previous-warmup-trace"]);
    expect(changes).toEqual(["created", "enabled"]);
    expect(JSON.parse(output)).toEqual(["existing", "fresh"]);
    const foreign = { ...existing, getProfilingStatus: () => ({ was: 2, filter: { unrelated: true } }) };
    expect(() =>
        runInNewContext(newDatabasesProfilerScript(), { db: { ...db, getSiblingDB: () => foreign }, print: () => {} }),
    ).toThrow("Unexpected profiler owner");
    expect(rows).toEqual(["previous-warmup-trace"]);
});
