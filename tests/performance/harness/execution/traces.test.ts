import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryFixture } from "../../fixtures/inventory";
import { clearTraceDirectory } from "../docker/traces";
import { sampleScenario } from "./samples";

const trace = (root: string, name: string) => join(root, `${createHash("sha256").update(name).digest("hex")}.ndjson`);

test("sequential measurement clears preparation and prior verification only after readiness and before the next send", async () => {
    const f = await inventoryFixture();
    const root = await mkdtemp(join(tmpdir(), "ulvia-sequential-traces-"));
    const events: string[] = [];
    let ready = false;
    let resets = 0;
    try {
        const obligation = { ...f.scenario.obligations[0]!, variant: "warm" as const };
        const result = await sampleScenario(
            { id: "unit", providerName: "unit", edgeName: "unit" },
            { ...f.scenario, samples: 2, obligations: [obligation] },
            obligation,
            async (index) => {
                ready = false;
                await writeFile(trace(root, `prepare-${index}`), "preparation");
                return {
                    async beforeMeasure() {
                        ready = true;
                    },
                    async send() {
                        expect(ready).toBe(true);
                        expect(await readdir(root)).toEqual([]);
                        events.push(`send-${index}`);
                        await writeFile(trace(root, `measured-${index}`), "measurement");
                        return { ...f.measurement, traceId: `measured-${index}` };
                    },
                    async verify() {
                        await writeFile(trace(root, `verify-${index}`), "postcondition");
                    },
                    async close() {
                        await writeFile(trace(root, `close-${index}`), "cleanup");
                    },
                };
            },
            async (_stack, scenario, selected, observations, phase = "measurement") => {
                expect(await readdir(root)).toHaveLength(1);
                events.push(`collect-${observations[0]!.traceId}`);
                return observations.map((row) => ({
                    ...f.measurement,
                    ...row,
                    scenario,
                    obligation: selected,
                    phase,
                    invocations: f.measurement.invocations.map((entry) => ({ ...entry, traceId: row.traceId })),
                }));
            },
            async () => {
                expect(ready).toBe(true);
                clearTraceDirectory(root);
                resets++;
            },
        );
        expect(result.status).toBe("passed");
        expect(resets).toBe(5);
        expect(result.measurements.filter((row) => row.phase === "measurement")).toHaveLength(2);
        expect(result.measurements.filter((row) => row.phase === "preparation")).toHaveLength(3);
        expect(events).toEqual(
            Array.from({ length: 5 }, (_, index) => [`send-${index}`, `collect-measured-${index}`]).flat(),
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("concurrent measurement clears once after every readiness hook and retains every active trace through collection", async () => {
    const f = await inventoryFixture();
    const root = await mkdtemp(join(tmpdir(), "ulvia-concurrent-traces-"));
    let ready = 0;
    let resets = 0;
    let sent = 0;
    try {
        const obligation = { ...f.scenario.obligations[0]!, variant: "concurrent" as const };
        const result = await sampleScenario(
            { id: "unit", providerName: "unit", edgeName: "unit" },
            {
                ...f.scenario,
                samples: 3,
                obligations: [obligation],
                load: { concurrency: 3, minimumRequestsPerMinute: 1 },
            },
            obligation,
            async (index) => {
                await writeFile(trace(root, `prepare-${index}`), "preparation");
                return {
                    async beforeMeasure() {
                        await writeFile(trace(root, `ready-${index}`), "readiness");
                        ready++;
                    },
                    async send() {
                        expect(ready).toBe(3);
                        expect(resets).toBe(1);
                        sent++;
                        await writeFile(trace(root, `measured-${index}`), "measurement");
                        await Bun.sleep(1);
                        return { ...f.measurement, traceId: `measured-${index}` };
                    },
                };
            },
            async (_stack, scenario, selected, observations) => {
                expect(sent).toBe(3);
                expect(await readdir(root)).toHaveLength(3);
                expect(resets).toBe(1);
                return observations.map((row) => ({
                    ...f.measurement,
                    ...row,
                    scenario,
                    obligation: selected,
                    invocations: f.measurement.invocations.map((entry) => ({ ...entry, traceId: row.traceId })),
                }));
            },
            async () => {
                expect(ready).toBe(3);
                expect(sent).toBe(0);
                clearTraceDirectory(root);
                resets++;
            },
        );
        expect(result.status).toBe("passed");
        expect(result.measurements).toHaveLength(3);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("failed trace reset blocks measurement and releases every prepared concurrent fixture", async () => {
    const f = await inventoryFixture();
    let sent = 0;
    let closed = 0;
    const obligation = { ...f.scenario.obligations[0]!, variant: "concurrent" as const };
    const result = await sampleScenario(
        { id: "unit", providerName: "unit", edgeName: "unit" },
        { ...f.scenario, samples: 2, obligations: [obligation] },
        obligation,
        async () => ({
            send: async () => {
                sent++;
                return f.measurement;
            },
            close: async () => {
                closed++;
            },
        }),
        async () => {
            throw new Error("Collector must not run before a successful trace reset");
        },
        async () => {
            throw new Error("Trace storage could not be reset");
        },
    );
    expect(result.status).toBe("blocked");
    expect(result.measurements).toEqual([]);
    expect(sent).toBe(0);
    expect(closed).toBe(2);
});
